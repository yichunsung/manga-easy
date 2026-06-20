import {
  OPENAI_MODELS,
  type ExtensionSettings,
  type TranslationHistoryItem
} from './types';

const API_KEY_KEY = 'openaiApiKey';
const MODEL_KEY = 'openaiModel';
const HISTORY_KEY = 'translationHistory';
const FLOATING_BUTTON_KEY = 'floatingButtonEnabled';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  openaiApiKey: '',
  openaiModel: 'gpt-5.4-mini'
};

function ensureChromeStorage() {
  if (!globalThis.chrome?.storage?.local) {
    throw new Error('請從已載入的 Chrome Extension 中開啟此頁面');
  }
}

export async function getSettings(): Promise<ExtensionSettings> {
  ensureChromeStorage();
  const result = await chrome.storage.local.get([API_KEY_KEY, MODEL_KEY]);
  const storedModel = result[MODEL_KEY] as
    | ExtensionSettings['openaiModel']
    | undefined;
  return {
    openaiApiKey: String(result[API_KEY_KEY] || ''),
    openaiModel: OPENAI_MODELS.includes(
      storedModel as ExtensionSettings['openaiModel']
    )
      ? (storedModel as ExtensionSettings['openaiModel'])
      : DEFAULT_SETTINGS.openaiModel
  };
}

export async function saveSettings(settings: ExtensionSettings) {
  ensureChromeStorage();
  await chrome.storage.local.set({
    [API_KEY_KEY]: settings.openaiApiKey,
    [MODEL_KEY]: settings.openaiModel
  });
}

export async function clearApiKey() {
  ensureChromeStorage();
  await chrome.storage.local.remove(API_KEY_KEY);
}

export async function getTranslationHistory(): Promise<TranslationHistoryItem[]> {
  ensureChromeStorage();
  const result = await chrome.storage.local.get(HISTORY_KEY);
  return Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
}

export async function clearTranslationHistory(): Promise<void> {
  ensureChromeStorage();
  await chrome.storage.local.remove(HISTORY_KEY);
}

export async function getFloatingButtonEnabled(): Promise<boolean> {
  ensureChromeStorage();
  const result = await chrome.storage.local.get(FLOATING_BUTTON_KEY);
  return Boolean(result[FLOATING_BUTTON_KEY]);
}

export async function setFloatingButtonEnabled(enabled: boolean): Promise<void> {
  ensureChromeStorage();
  await chrome.storage.local.set({ [FLOATING_BUTTON_KEY]: enabled });
}

export function subscribeToTranslationHistory(
  listener: (history: TranslationHistoryItem[]) => void
) {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== 'local' || !changes[HISTORY_KEY]) return;
    const nextValue = changes[HISTORY_KEY].newValue;
    listener(Array.isArray(nextValue) ? nextValue : []);
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
