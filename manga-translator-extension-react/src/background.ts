import type { MangaTranslatorMessage } from './shared/types';

chrome.runtime.onMessage.addListener(
  (
    message: MangaTranslatorMessage,
    sender,
    sendResponse: (response: {
      ok: boolean;
      dataUrl?: string;
      error?: string;
    }) => void
  ) => {
    if (message.type !== 'MANGA_TRANSLATOR_CAPTURE') return;

    void (async () => {
      try {
        if (sender.tab?.windowId === undefined) {
          throw new Error('找不到目前分頁視窗');
        }

        const dataUrl = await chrome.tabs.captureVisibleTab(
          sender.tab.windowId,
          { format: 'png' }
        );
        sendResponse({ ok: true, dataUrl });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })();

    return true;
  }
);
