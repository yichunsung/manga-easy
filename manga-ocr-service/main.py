import base64
import binascii
import os
from io import BytesIO
from typing import Any

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

TRANSLATION_PROMPT = """你是日文漫畫翻譯助手。
以下是從日本漫畫圖片 OCR 出來的日文文字。
請翻譯成台灣正體中文。
翻譯要自然、符合漫畫台詞語氣。
如果 OCR 文字明顯破碎或無法理解，請明確說「看不清楚」。
只輸出翻譯後的中文，不要解釋。"""


class TranslateImageRequest(BaseModel):
    imageBase64: Any = None


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

    image = decode_image(payload.imageBase64.strip())

    try:
        ocr_text = (await run_in_threadpool(manga_ocr, image)).strip()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"MangaOCR failed: {exc}",
        ) from exc

    if not ocr_text:
        return {
            "ocrText": "",
            "translatedText": "看不清楚",
        }

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not configured",
        )

    try:
        client = AsyncOpenAI(api_key=api_key)
        response = await client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            input=f"{TRANSLATION_PROMPT}\n\nOCR 文字：\n{ocr_text}",
        )
        translated_text = response.output_text.strip()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"OpenAI translation failed: {exc}",
        ) from exc

    return {
        "ocrText": ocr_text,
        "translatedText": translated_text,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8787, reload=True)
