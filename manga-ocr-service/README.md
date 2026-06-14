# Manga OCR Service

以 FastAPI 提供日文漫畫圖片 OCR 與台灣正體中文翻譯服務。圖片會先由
MangaOCR 辨識日文，再透過 OpenAI Responses API 翻譯。

## 安裝方式

需要 Python 3.10 以上版本。首次啟動 MangaOCR 時可能會下載模型檔案。

```bash
cd manga-ocr-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

若曾經安裝過未鎖版的套件，請強制重裝相容版本：

```bash
pip install --upgrade --force-reinstall -r requirements.txt
```

`requirements.txt` 將 NumPy、Transformers、PyTorch 與 torchvision
鎖定為彼此相容的版本。Intel macOS 的 PyTorch wheel 最高停在 2.2.2，
因此 Transformers 也固定使用可載入 MangaOCR 模型的 4.48.3。

## .env 設定

複製環境變數範例：

```bash
cp .env.example .env
```

編輯 `.env`：

```dotenv
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_API_KEY` 必須設定。`OPENAI_MODEL` 未設定時會使用
`gpt-4.1-mini`。

## 啟動方式

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8787
```

健康檢查：

```bash
curl http://localhost:8787/health
```

預期回應：

```json
{"ok":true}
```

## curl 測試範例

將 `sample.png` 換成要測試的漫畫圖片：

```bash
curl -X POST http://localhost:8787/translate-image \
  -H "Content-Type: application/json" \
  --data "{\"imageBase64\":\"data:image/png;base64,$(base64 < sample.png | tr -d '\n')\"}"
```

成功回應格式：

```json
{
  "ocrText": "辨識出的日文",
  "translatedText": "翻譯後的台灣正體中文"
}
```
