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
    if (message.type === 'MANGA_TRANSLATOR_GET_FLOATING_BUTTON_STATE') {
      void (async () => {
        if (sender.tab?.id === undefined) {
          sendResponse({ ok: false, error: '找不到目前分頁' });
          return;
        }

        const result = await chrome.storage.session.get('floatingButtonTabs');
        const tabs =
          result.floatingButtonTabs &&
          typeof result.floatingButtonTabs === 'object'
            ? result.floatingButtonTabs
            : {};
        sendResponse({
          ok: true,
          enabled: Boolean(tabs[String(sender.tab.id)])
        } as { ok: boolean; enabled: boolean });
      })();
      return true;
    }

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

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const result = await chrome.storage.session.get('floatingButtonTabs');
    const tabs =
      result.floatingButtonTabs &&
      typeof result.floatingButtonTabs === 'object'
        ? { ...result.floatingButtonTabs }
        : {};
    delete tabs[String(tabId)];
    await chrome.storage.session.set({ floatingButtonTabs: tabs });
  })();
});
