import base64
import binascii
import os
import re
from datetime import datetime
from io import BytesIO
from typing import Any

import fugashi
import jaconv
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from manga_ocr import MangaOcr
from openai import AsyncOpenAI
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Manga OCR Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Loading MangaOCR is expensive, so keep one model instance for the process.
manga_ocr = MangaOcr()
japanese_tagger = fugashi.Tagger()
ALLOWED_OPENAI_MODELS = {
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4",
    "gpt-3.5-turbo",
}
CHAT_COMPLETIONS_MODELS = {"gpt-4", "gpt-3.5-turbo"}
DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"

TRANSLATION_PROMPT = """你是日文漫畫翻譯助手。
以下是從日本漫畫圖片 OCR 出來的日文文字。
請翻譯成台灣正體中文。
翻譯要自然、符合漫畫台詞語氣。
如果 OCR 文字明顯破碎或無法理解，請明確說「看不清楚」。
只輸出翻譯後的中文，不要解釋。"""


class TranslateImageRequest(BaseModel):
    imageBase64: Any = None
    apiKey: Any = None
    model: Any = None


def log(message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)


def romanize_japanese(text: str) -> str:
    parts = []

    for word in japanese_tagger(text):
        reading = (
            getattr(word.feature, "kana", None)
            or getattr(word.feature, "pron", None)
            or word.surface
        )
        parts.append(jaconv.kata2alphabet(reading))

    romanized = " ".join(parts)
    romanized = re.sub(
        r"xtsu\s*([bcdfghjklmnpqrstvwxyz])",
        lambda match: match.group(1) * 2,
        romanized,
        flags=re.IGNORECASE,
    )
    return romanized.replace("？", "?").replace("！", "!").strip()


def decode_image(image_base64: str) -> Image.Image:
    encoded_data = image_base64

    if image_base64.startswith("data:"):
        header, separator, encoded_data = image_base64.partition(",")
        if not separator or ";base64" not in header.lower():
            raise HTTPException(status_code=400, detail="Invalid image data URL")

    try:
        image_bytes = base64.b64decode(encoded_data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image data") from exc

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Decoded image is empty")

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.load()
            return image.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid image data") from exc


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/translate-image")
async def translate_image(payload: TranslateImageRequest) -> dict[str, str]:
    if not isinstance(payload.imageBase64, str) or not payload.imageBase64.strip():
        raise HTTPException(
            status_code=400,
            detail="imageBase64 is required and must be a non-empty string",
        )
    log("Received image for translation")
    image = decode_image(payload.imageBase64.strip())

    try:
        ocr_text = (await run_in_threadpool(manga_ocr, image)).strip()
        log(f"OCR text extracted: {ocr_text}")
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"MangaOCR failed: {exc}",
        ) from exc

    if not ocr_text:
        return {
            "ocrEngine": "manga-ocr",
            "ocrText": "",
            "romanizedText": "",
            "translatedText": "看不清楚",
        }

    romanized_text = romanize_japanese(ocr_text)

    request_api_key = (
        payload.apiKey.strip()
        if isinstance(payload.apiKey, str)
        else ""
    )
    api_key = request_api_key or os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="OpenAI API Key is not configured",
        )

    model = (
        payload.model.strip()
        if isinstance(payload.model, str) and payload.model.strip()
        else os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)
    )
    if model not in ALLOWED_OPENAI_MODELS:
        raise HTTPException(status_code=400, detail="Unsupported OpenAI model")
    log(f"OpenAI model selected by user: {model}")

    try:
        openai_client = AsyncOpenAI(api_key=api_key)
        prompt = f"{TRANSLATION_PROMPT}\n\nOCR 文字：\n{ocr_text}"

        if model in CHAT_COMPLETIONS_MODELS:
            response = await openai_client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
            )
            translated_text = (
                response.choices[0].message.content or ""
            ).strip()
        else:
            response = await openai_client.responses.create(
                model=model,
                input=prompt,
            )
            translated_text = response.output_text.strip()
        log("Translation completed")
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"OpenAI translation failed: {exc}",
        ) from exc

    return {
        "ocrEngine": "manga-ocr",
        "ocrText": ocr_text,
        "romanizedText": romanized_text,
        "translatedText": translated_text,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8787, reload=True)
