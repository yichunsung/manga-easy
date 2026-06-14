const startSelectionButton = document.querySelector('#start-selection');
const clearResultsButton = document.querySelector('#clear-results');
const toggleFloatingButton = document.querySelector('#toggle-floating-button');
const floatingButtonLabel = document.querySelector('#floating-button-label');
const status = document.querySelector('#status');

loadFloatingButtonState();

startSelectionButton.addEventListener('click', () => {
  sendToActiveTab('MANGA_TRANSLATOR_START_SELECT');
});

clearResultsButton.addEventListener('click', () => {
  sendToActiveTab('MANGA_TRANSLATOR_CLEAR_RESULTS');
});

toggleFloatingButton.addEventListener('click', async () => {
  status.textContent = '';

  try {
    const { floatingButtonEnabled = false } = await chrome.storage.local.get(
      'floatingButtonEnabled'
    );
    const enabled = !floatingButtonEnabled;

    await chrome.storage.local.set({ floatingButtonEnabled: enabled });
    await sendToActiveTab('MANGA_TRANSLATOR_SET_FLOATING_BUTTON', {
      enabled
    });
  } catch (error) {
    status.textContent = '無法切換常駐按鈕，請重新整理一般網頁後再試。';
    console.error(error);
  }
});

async function loadFloatingButtonState() {
  const { floatingButtonEnabled = false } = await chrome.storage.local.get(
    'floatingButtonEnabled'
  );
  floatingButtonLabel.textContent = floatingButtonEnabled
    ? '關閉常駐框選按鈕'
    : '啟用常駐框選按鈕';
}

async function sendToActiveTab(type, payload = {}) {
  status.textContent = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('找不到目前分頁');

    await chrome.tabs.sendMessage(tab.id, { type, ...payload });
    window.close();
  } catch (error) {
    status.textContent = '此頁面無法使用，請重新整理一般網頁後再試。';
    console.error(error);
  }
}
