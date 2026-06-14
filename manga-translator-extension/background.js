chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'MANGA_TRANSLATOR_CAPTURE') return;

  (async () => {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
        format: 'png'
      });
      sendResponse({ ok: true, dataUrl });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();

  return true;
});
