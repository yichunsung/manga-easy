# Manga Translator Extension React

原版 Chrome Extension 的 React + TypeScript + Vite 移植版。

`manga-translator-extension` 保持獨立；此專案的程式、建置與輸出都位於
`manga-translator-extension-react`。

## 功能

- Popup「框選翻譯」
- 一鍵清除目前頁面的翻譯面板
- 依分頁開啟或關閉右下角常駐框選按鈕；不會影響其他分頁
- Popup 開啟 Chrome Side Panel
- Popup 設定及清除 OpenAI API Key
- Popup 選擇 OpenAI 模型
- 可選擇正體中文、簡體中文、英文或韓文；介面與翻譯目標語言會同步切換
- 擷取目前可見分頁並裁切框選圖片
- 呼叫 `POST http://localhost:8787/translate-image`
- 驗證後端使用 MangaOCR
- 顯示 OCR 原文、羅馬拼音及翻譯
- 翻譯面板可拖曳、關閉及切換羅馬拼音
- 使用 `chrome.storage.local` 保存最近 100 筆翻譯紀錄
- Side Panel 即時顯示及清除翻譯紀錄
- Side Panel 可切換「翻譯紀錄 / 字典檔設定」
- 字典檔與詞條保存在 `chrome.storage.local`
- 最多 6 個字典檔，每個字典最多 50 筆詞條
- 可選擇目前使用中的字典檔
- 可新增、改名、刪除字典檔及維護詞條
- 翻譯時會將目前使用中字典的詞條送至 MangaOCR 後端翻譯 prompt
- 翻譯紀錄可開啟前後文翻譯；啟用時才帶入最近 5 筆原文與翻譯

## 安裝與建置

需要 Node.js 18 以上：

```bash
cd manga-translator-extension-react
npm install
npm run build
```

接著：

1. 開啟 `chrome://extensions`
2. 開啟「開發人員模式」
3. 點擊「載入未封裝項目」
4. 選擇 `manga-translator-extension-react/dist`

每次修改後重新執行 `npm run build`，再到 Chrome 重新載入 Extension。

## 主要結構

```text
src/
├── background.ts       # captureVisibleTab
├── content/
│   ├── content.ts      # 框選、截圖、API 與結果面板
│   └── content.css
├── popup/              # React Popup
├── sidepanel/          # React Side Panel
└── shared/             # 共用型別及 chrome.storage.local
```

`public/manifest.json` 會由 Vite 原樣複製成 `dist/manifest.json`。
