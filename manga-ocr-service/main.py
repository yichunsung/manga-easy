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

TARGET_LANGUAGES = {
    "zh-TW": {
        "name": "台灣正體中文",
        "unreadable": "看不清楚",
    },
    "zh-CN": {
        "name": "简体中文",
        "unreadable": "看不清楚",
    },
    "en": {
        "name": "英文",
        "unreadable": "Unreadable",
    },
    "ko": {
        "name": "韓文",
        "unreadable": "읽을 수 없음",
    },
}
DEFAULT_TARGET_LANGUAGE = "zh-TW"


class TranslateImageRequest(BaseModel):
    imageBase64: Any = None
    apiKey: Any = None
    model: Any = None
    dictionaryTitle: Any = None
    dictionaryEntries: Any = None
    contextTranslationEnabled: Any = False
    translationContext: Any = None
    targetLanguage: Any = DEFAULT_TARGET_LANGUAGE


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


def get_matching_dictionary_lines(
    dictionary_entries: Any,
    ocr_text: str,
) -> list[str]:
    if not isinstance(dictionary_entries, list):
        return []

    matched_lines = []
    seen_origins = set()

    for entry in dictionary_entries[:50]:
        if not isinstance(entry, dict):
            continue

        origin = str(entry.get("origin") or "").strip()
        value = str(entry.get("value") or "").strip()
        if (
            not origin
            or not value
            or origin in seen_origins
            or origin not in ocr_text
        ):
            continue

        seen_origins.add(origin)
        matched_lines.append(f"{origin} => {value}")
        log(f"Dictionary hit: {origin} => {value}")

    return matched_lines


def build_user_prompt(
    ocr_text: str,
    dictionary_lines: list[str],
    context_originals: list[str],
    context_translations: list[str],
    target_language_name: str,
) -> str:
    glossary_text = "\n".join(dictionary_lines) if dictionary_lines else "無"
    context_text = ""
    if context_originals and context_translations:
        context_text = f"""

【前文原文】
{chr(10).join(context_originals)}

【前文翻譯】
{chr(10).join(context_translations)}
"""

    return f"""【漫畫字典】
{glossary_text}
{context_text}

【翻譯規則】
1. 漫畫字典是固定譯名，優先級最高。
2. 角色名、地名、組織名、招式名必須照字典翻譯。
3. 沒有出現在字典中的詞，請依上下文自然翻譯。
4. 保留漫畫對話的簡短、自然語氣。
5. 只輸出{target_language_name}翻譯。

【待翻譯日文】
{ocr_text}"""


def build_system_prompt(target_language_name: str) -> str:
    return f"""你是專業日文漫畫翻譯助手。
請翻譯成{target_language_name}。
必須遵守使用者提供的漫畫字典。
不要輸出說明、註解或額外文字。"""


def get_translation_context(
    enabled: Any,
    translation_context: Any,
) -> tuple[list[str], list[str]]:
    if enabled is not True or not isinstance(translation_context, list):
        return [], []

    originals = []
    translations = []
    for item in translation_context[-5:]:
        if not isinstance(item, dict):
            continue
        original_text = str(item.get("originalText") or "").strip()
        translated_text = str(item.get("translatedText") or "").strip()
        if not original_text or not translated_text:
            continue
        originals.append(original_text)
        translations.append(translated_text)

    return originals, translations


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

    target_language = (
        payload.targetLanguage
        if isinstance(payload.targetLanguage, str)
        and payload.targetLanguage in TARGET_LANGUAGES
        else DEFAULT_TARGET_LANGUAGE
    )
    target_language_config = TARGET_LANGUAGES[target_language]
    log(
        f"Target language selected by user: "
        f"{target_language} ({target_language_config['name']})"
    )

    if not ocr_text:
        return {
            "ocrEngine": "manga-ocr",
            "ocrText": "",
            "romanizedText": "",
            "translatedText": target_language_config["unreadable"],
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
        dictionary_lines = get_matching_dictionary_lines(
            payload.dictionaryEntries,
            ocr_text,
        )
        dictionary_title = str(payload.dictionaryTitle or "使用者字典").strip()
        log(
            f"Dictionary matching: {dictionary_title} "
            f"({len(dictionary_lines)} hits)"
        )
        context_originals, context_translations = get_translation_context(
            payload.contextTranslationEnabled,
            payload.translationContext,
        )
        if context_originals:
            log(f"Applying translation context: {len(context_originals)} items")
        else:
            log("Translation context disabled or empty")

        user_prompt = build_user_prompt(
            ocr_text,
            dictionary_lines,
            context_originals,
            context_translations,
            target_language_config["name"],
        )
        system_prompt = build_system_prompt(target_language_config["name"])

        if model in CHAT_COMPLETIONS_MODELS:
            response = await openai_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            translated_text = (
                response.choices[0].message.content or ""
            ).strip()
        else:
            response = await openai_client.responses.create(
                model=model,
                instructions=system_prompt,
                input=user_prompt,
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
