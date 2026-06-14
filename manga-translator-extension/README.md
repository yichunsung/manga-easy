# Manga Translator Extension

Chrome Manifest V3 擴充功能，用於在網頁上框選漫畫文字、擷取圖片，並顯示
本機翻譯服務回傳的台灣正體中文。

## 功能

- 點擊擴充功能圖示後進入框選模式
- 擷取目前可見分頁
- 依瀏覽器像素比例裁切框選區域
- 呼叫 `POST http://localhost:8787/translate-image`
- API 執行期間持續顯示「辨識與翻譯中」
- 在框選區域旁顯示翻譯結果
- 依中文或英文句點自動分行

## 檔案說明

```text
manga-translator-extension/
├── manifest.json   # 權限、背景程序與 content script 設定
├── background.js   # 接收訊息並擷取目前可見分頁
├── content.js      # 框選、裁切、API 呼叫與結果顯示
└── content.css     # 框選框、提示與翻譯結果樣式
```

## 安裝方式

1. 先啟動 `manga-ocr-service` 或 `manga-translator-server`。
2. 在 Chrome 開啟 `chrome://extensions`。
3. 開啟「開發人員模式」。
4. 點擊「載入未封裝項目」。
5. 選擇本資料夾 `manga-translator-extension`。
6. 將擴充功能固定在 Chrome 工具列，方便使用。

修改檔案後，需要回到 `chrome://extensions` 點擊「重新載入」，並重新整理
正在測試的網頁。

## 使用方式

1. 開啟含有漫畫圖片的網頁。
2. 點擊工具列上的 Manga Area Translator 圖示。
3. 按住滑鼠左鍵框選日文文字區域。
4. 等待右上角的「辨識與翻譯中」提示消失。
5. 在選取區域旁查看翻譯，點擊 `×` 可關閉結果。

## API 契約

Extension 會傳送：

```http
POST http://localhost:8787/translate-image
Content-Type: application/json
```

```json
{
  "imageBase64": "data:image/png;base64,..."
}
```

主要後端回應：

```json
{
  "ocrText": "辨識出的日文",
  "translatedText": "翻譯後的台灣正體中文"
}
```

Extension 顯示 `translatedText`。

## 修改 API 位址

API 位址定義在 `content.js`：

```javascript
const API_URL = 'http://localhost:8787/translate-image';
```

如果改用其他主機或 port，也要同步修改 `manifest.json` 的
`host_permissions`，再重新載入擴充功能。

## 常見問題

### 顯示 `API 500`

查看後端終端輸出，並確認 `.env` 已設定有效的 `OPENAI_API_KEY`。

### 顯示 `Failed to fetch`

確認後端正在 `8787` port 執行，且 `manifest.json` 允許該 API 網址。

### 點擊圖示沒有出現框選模式

重新載入 Extension 並重新整理目前網頁。Chrome 系統頁面及擴充功能頁面通常
不允許 content script 執行。
