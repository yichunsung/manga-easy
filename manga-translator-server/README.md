# Manga Translator Server

使用 Express 與 OpenAI Responses API 的替代後端。此版本不使用本機
MangaOCR，而是直接將框選圖片交由 OpenAI 辨識日文並翻譯。

目前主要後端為 `../manga-ocr-service`。兩者都預設使用 `8787`，請擇一啟動。

## 環境需求

- Node.js 18 以上
- npm
- OpenAI API Key

## 安裝方式

```bash
cd manga-translator-server
npm install
cp .env.example .env
```

編輯 `.env`：

```dotenv
OPENAI_API_KEY=your_openai_api_key_here
PORT=8787
```

不要將真實 API Key 提交到 Git。

## 啟動方式

```bash
npm run dev
```

服務預設監聽：

```text
http://localhost:8787
```

## API

### 健康檢查

```bash
curl http://localhost:8787/health
```

回應：

```json
{"ok":true}
```

### 圖片翻譯

```http
POST /translate-image
Content-Type: application/json
```

Request：

```json
{
  "imageBase64": "data:image/png;base64,...",
  "apiKey": "sk-...",
  "model": "gpt-5.4-mini"
}
```

Response：

```json
{
  "translatedText": "翻譯後的台灣正體中文"
}
```

測試範例：

```bash
curl -X POST http://localhost:8787/translate-image \
  -H "Content-Type: application/json" \
  --data "{\"imageBase64\":\"data:image/png;base64,$(base64 < sample.png | tr -d '\n')\"}"
```

## 與 Python 後端的差異

| 項目 | Node.js Server | Python OCR Service |
| --- | --- | --- |
| OCR | OpenAI 圖片理解 | 本機 MangaOCR |
| 翻譯 | OpenAI | OpenAI |
| 回傳 OCR 原文 | 否 | 是 |
| 模型下載 | 不需要 | 首次啟動需要 |
| 預設 port | 8787 | 8787 |

## 檔案說明

```text
manga-translator-server/
├── server.js       # Express API 與 OpenAI 呼叫
├── package.json    # npm scripts 與相依套件
├── .env.example    # 環境變數範例
└── .gitignore
```
