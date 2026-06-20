# Manga OCR Service

以 FastAPI 提供日文漫畫圖片 OCR 與台灣正體中文翻譯服務。圖片會先由
MangaOCR 辨識日文，再透過 OpenAI Responses API 翻譯。

這是 `manga-translator-extension` 目前建議使用的主要後端。

## 處理流程

1. 接收 Extension 傳來的 base64 圖片。
2. 使用 Pillow 解碼並轉換為 RGB 圖片。
3. 使用全域單例 MangaOCR 模型辨識日文。
4. 將日文讀音轉換成羅馬拼音。
5. 將 OCR 文字交由 OpenAI 翻譯成台灣正體中文。
6. 回傳 OCR 原文、羅馬拼音與翻譯結果。

## 環境需求

- Python 3.10 以上
- OpenAI API Key
- 首次下載 MangaOCR 模型時需要網路連線

## 安裝方式

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
OPENAI_MODEL=gpt-5.4-mini
```

`OPENAI_API_KEY` 可作為後端 fallback。Extension 也可在每次 request 傳入
`apiKey` 與 `model`。`OPENAI_MODEL` 未設定時會使用
`gpt-5.4-mini`。

## 啟動方式

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8787
```

也可以直接執行：

```bash
python main.py
```

首次啟動會從 Hugging Face 下載 `kha-white/manga-ocr-base`，模型載入完成並
出現 `OCR ready` 後才會開始接受請求。

## API

### 健康檢查

```bash
curl http://localhost:8787/health
```

預期回應：

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
  "model": "gpt-5.4-mini",
  "dictionaryTitle": "角色名稱",
  "dictionaryEntries": [
    {
      "origin": "ミカ",
      "value": "米卡",
      "type": "character",
      "note": "角色名"
    }
  ]
}
```

後端會先以 MangaOCR 取得日文文字，再檢查 OCR 文字是否包含字典的 `origin`。
只有實際命中的詞條會加入翻譯 prompt，未命中的詞條不會送給 OpenAI。

Response：

```json
{
  "ocrText": "辨識出的日文",
  "romanizedText": "辨識文字的羅馬拼音",
  "translatedText": "翻譯後的台灣正體中文"
}
```

如果 OCR 沒有辨識出文字：

```json
{
  "ocrText": "",
  "romanizedText": "",
  "translatedText": "看不清楚"
}
```

## curl 測試

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
  "romanizedText": "辨識文字的羅馬拼音",
  "translatedText": "翻譯後的台灣正體中文"
}
```

## 檔案說明

```text
manga-ocr-service/
├── main.py          # FastAPI、圖片解碼、OCR 與 OpenAI 翻譯
├── requirements.txt # Python 相依套件與相容版本
├── .env.example     # 環境變數範例
└── .python-version  # pyenv 使用的 Python 版本
```

## 常見問題

### NumPy 或 PyTorch 無法載入

重新安裝已鎖定的相容版本：

```bash
pip install --upgrade --force-reinstall -r requirements.txt
```

### 啟動停在 `Loading OCR model`

首次啟動需要下載模型。確認可以連線至 Hugging Face，並等待終端顯示
`OCR ready`。

### Port 8787 已被使用

確認 `manga-translator-server` 沒有同時執行，或結束其他占用 `8787` 的程序。

### OpenAI 回傳錯誤

確認 `.env` 的 `OPENAI_API_KEY` 有效且帳戶可使用設定的 `OPENAI_MODEL`。
