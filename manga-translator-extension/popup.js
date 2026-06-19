const OPENAI_API_KEY_STORAGE_KEY = 'openaiApiKey';
const OPENAI_MODEL_STORAGE_KEY = 'openaiModel';
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';
const ALLOWED_OPENAI_MODELS = new Set([
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4',
  'gpt-3.5-turbo'
]);

const startSelectionButton = document.querySelector('#start-selection');
const clearResultsButton = document.querySelector('#clear-results');
const toggleFloatingButton = document.querySelector('#toggle-floating-button');
const openSidePanelButton = document.querySelector('#open-side-panel');
const openSettingsButton = document.querySelector('#open-settings');
const closeSettingsButton = document.querySelector('#close-settings');
const clearApiKeyButton = document.querySelector('#clear-api-key');
const settingsForm = document.querySelector('#settings-form');
const menuView = document.querySelector('#menu-view');
const settingsView = document.querySelector('#settings-view');
const apiKeyInput = document.querySelector('#openai-api-key');
const modelSelect = document.querySelector('#openai-model');
const floatingButtonLabel = document.querySelector('#floating-button-label');
const menuStatus = document.querySelector('#menu-status');
const settingsStatus = document.querySelector('#settings-status');
let currentWindowId = null;

loadFloatingButtonState();
loadCurrentWindow();

startSelectionButton.addEventListener('click', () => {
  sendToActiveTab('MANGA_TRANSLATOR_START_SELECT');
});

clearResultsButton.addEventListener('click', () => {
  sendToActiveTab('MANGA_TRANSLATOR_CLEAR_RESULTS');
});

toggleFloatingButton.addEventListener('click', async () => {
  menuStatus.textContent = '';

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
    menuStatus.textContent = '無法切換常駐按鈕，請重新整理一般網頁後再試。';
    console.error(error);
  }
});

openSidePanelButton.addEventListener('click', async () => {
  menuStatus.textContent = '';

  try {
    await chrome.sidePanel.open({ windowId: currentWindowId });
    window.close();
  } catch (error) {
    menuStatus.textContent = '無法開啟側邊欄，請確認 Chrome 已更新至支援版本。';
    console.error(error);
  }
});

openSettingsButton.addEventListener('click', async () => {
  await loadOpenAiSettings();
  menuView.hidden = true;
  settingsView.hidden = false;
  apiKeyInput.focus();
});

closeSettingsButton.addEventListener('click', () => {
  settingsView.hidden = true;
  menuView.hidden = false;
});

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  settingsStatus.textContent = '';

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    settingsStatus.textContent = '請輸入 OpenAI API Key。';
    return;
  }

  await chrome.storage.local.set({
    [OPENAI_API_KEY_STORAGE_KEY]: apiKey,
    [OPENAI_MODEL_STORAGE_KEY]: modelSelect.value
  });
  settingsStatus.textContent = '設定已儲存。';
});

clearApiKeyButton.addEventListener('click', async () => {
  await chrome.storage.local.remove(OPENAI_API_KEY_STORAGE_KEY);
  apiKeyInput.value = '';
  settingsStatus.textContent = 'API Key 已清除。';
  apiKeyInput.focus();
});

async function loadCurrentWindow() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    currentWindowId = currentWindow.id;
    openSidePanelButton.disabled = false;
  } catch (error) {
    menuStatus.textContent = '無法取得目前視窗。';
    console.error(error);
  }
}

async function loadOpenAiSettings() {
  const settings = await chrome.storage.local.get([
    OPENAI_API_KEY_STORAGE_KEY,
    OPENAI_MODEL_STORAGE_KEY
  ]);
  apiKeyInput.value = settings[OPENAI_API_KEY_STORAGE_KEY] || '';
  const storedModel = settings[OPENAI_MODEL_STORAGE_KEY];
  modelSelect.value = ALLOWED_OPENAI_MODELS.has(storedModel)
    ? storedModel
    : DEFAULT_OPENAI_MODEL;
  settingsStatus.textContent = '';
}

async function loadFloatingButtonState() {
  const { floatingButtonEnabled = false } = await chrome.storage.local.get(
    'floatingButtonEnabled'
  );
  floatingButtonLabel.textContent = floatingButtonEnabled
    ? '關閉常駐框選按鈕'
    : '啟用常駐框選按鈕';
}

async function sendToActiveTab(type, payload = {}) {
  menuStatus.textContent = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('找不到目前分頁');

    await chrome.tabs.sendMessage(tab.id, { type, ...payload });
    window.close();
  } catch (error) {
    menuStatus.textContent = '此頁面無法使用，請重新整理一般網頁後再試。';
    console.error(error);
  }
}
