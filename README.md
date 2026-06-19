# Manga Easy

在 Chrome 網頁上框選日本漫畫文字區域，透過本機後端進行 OCR，並翻譯成
台灣正體中文。

## 專案結構

```text
manga-translator-mvp/
├── manga-translator-extension/  # Chrome Extension：框選、截圖、顯示翻譯
├── manga-ocr-service/           # FastAPI：MangaOCR + OpenAI 翻譯（主要後端）
└── manga-translator-server/     # 舊 Express 後端（目前不修改）
```

Extension 請只搭配 `manga-ocr-service`。Extension 會檢查後端是否回報使用
MangaOCR，不接受舊 Node.js 圖片直送後端的結果。

## 主要流程

1. 點擊 Chrome 工具列上的擴充功能圖示。
2. 在漫畫頁面拖曳框選文字區域。
3. Extension 擷取可見分頁並裁切選取範圍。
4. 圖片以 data URL 傳送至 `POST http://localhost:8787/translate-image`。
5. Python 後端使用 MangaOCR 辨識日文，再交由 OpenAI 翻譯。
6. 翻譯結果顯示在框選區域旁，並依句點分行。

## 快速開始

### 1. 啟動 Python OCR 後端

```bash
cd manga-ocr-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

可在 `.env` 設定 `OPENAI_API_KEY` 作為 fallback，或在 Extension Popup
輸入使用者自己的 API Key。接著啟動：

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8787
```

首次啟動會下載 MangaOCR 模型，所需時間取決於網路速度。

### 2. 載入 Chrome Extension

1. 開啟 `chrome://extensions`。
2. 開啟右上角「開發人員模式」。
3. 點擊「載入未封裝項目」。
4. 選擇 `manga-translator-extension` 資料夾。
5. 修改程式後，在擴充功能頁面按「重新載入」。

### 3. 確認服務

```bash
curl http://localhost:8787/health
```

預期回應：

```json
{"ok":true}
```

## 環境需求

- Chrome 或 Chromium 系瀏覽器
- Python 3.10 以上
- OpenAI API Key
- 首次下載 MangaOCR 模型時需要網路連線

## 注意事項

- `.env` 包含 API Key，不應提交到 Git。Popup 中的 API Key 儲存在
  `chrome.storage.local`，不屬於加密儲存。
- Extension 目前固定呼叫 `http://localhost:8787`。
- OCR 準確度會受到圖片解析度、字體、文字方向及背景複雜度影響。
- 本專案會將 OCR 後的文字送至 OpenAI 翻譯。
- 所有模型都只能接收 MangaOCR 輸出的文字；原始圖片不會傳給 OpenAI。

各元件的詳細說明請查看其資料夾內的 README。

- [Chrome Extension](manga-translator-extension/README.md)
- [Python OCR Service](manga-ocr-service/README.md)
- [舊 Node.js Server](manga-translator-server/README.md)
