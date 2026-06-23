import {
  TRANSLATION_MODELS,
  UI_LANGUAGES,
  type DictionaryFile,
  type DictionaryState,
  type ExtensionSettings,
  type TranslationHistoryItem
} from './types';

const API_KEY_KEY = 'openaiApiKey';
const MODEL_KEY = 'openaiModel';
const UI_LANGUAGE_KEY = 'uiLanguage';
const HISTORY_KEY = 'translationHistory';
const FLOATING_BUTTON_TABS_KEY = 'floatingButtonTabs';
const DICTIONARY_FILES_KEY = 'dictionaryFiles';
const ACTIVE_DICTIONARY_KEY = 'activeDictionaryId';
const CONTEXT_TRANSLATION_KEY = 'contextTranslationEnabled';

export const MAX_DICTIONARY_FILES = 6;
export const MAX_DICTIONARY_ENTRIES = 50;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  openaiApiKey: '',
  openaiModel: 'gpt-5.4-mini',
  uiLanguage: 'zh-TW'
};

function ensureChromeStorage() {
  if (!globalThis.chrome?.storage?.local) {
    throw new Error('請從已載入的 Chrome Extension 中開啟此頁面');
  }
}

export async function getSettings(): Promise<ExtensionSettings> {
  ensureChromeStorage();
  const result = await chrome.storage.local.get([
    API_KEY_KEY,
    MODEL_KEY,
    UI_LANGUAGE_KEY
  ]);
  const storedModel = result[MODEL_KEY] as
    | ExtensionSettings['openaiModel']
    | undefined;
  const storedLanguage = result[UI_LANGUAGE_KEY] as
    | ExtensionSettings['uiLanguage']
    | undefined;
  return {
    openaiApiKey: String(result[API_KEY_KEY] || ''),
    openaiModel: TRANSLATION_MODELS.includes(
      storedModel as ExtensionSettings['openaiModel']
    )
      ? (storedModel as ExtensionSettings['openaiModel'])
      : DEFAULT_SETTINGS.openaiModel,
    uiLanguage: UI_LANGUAGES.includes(
      storedLanguage as ExtensionSettings['uiLanguage']
    )
      ? (storedLanguage as ExtensionSettings['uiLanguage'])
      : DEFAULT_SETTINGS.uiLanguage
  };
}

export async function saveSettings(settings: ExtensionSettings) {
  ensureChromeStorage();
  await chrome.storage.local.set({
    [API_KEY_KEY]: settings.openaiApiKey,
    [MODEL_KEY]: settings.openaiModel,
    [UI_LANGUAGE_KEY]: settings.uiLanguage
  });
}

export async function getUiLanguage(): Promise<ExtensionSettings['uiLanguage']> {
  return (await getSettings()).uiLanguage;
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

export async function deleteTranslationHistoryItem(
  itemId: string
): Promise<void> {
  ensureChromeStorage();
  const history = await getTranslationHistory();
  await chrome.storage.local.set({
    [HISTORY_KEY]: history.filter((item) => item.id !== itemId)
  });
}

export async function getFloatingButtonEnabled(tabId: number): Promise<boolean> {
  const result = await chrome.storage.session.get(FLOATING_BUTTON_TABS_KEY);
  const tabs = normalizeFloatingButtonTabs(result[FLOATING_BUTTON_TABS_KEY]);
  return Boolean(tabs[String(tabId)]);
}

export async function setFloatingButtonEnabled(
  tabId: number,
  enabled: boolean
): Promise<void> {
  const result = await chrome.storage.session.get(FLOATING_BUTTON_TABS_KEY);
  const tabs = normalizeFloatingButtonTabs(result[FLOATING_BUTTON_TABS_KEY]);
  const key = String(tabId);

  if (enabled) {
    tabs[key] = true;
  } else {
    delete tabs[key];
  }

  await chrome.storage.session.set({ [FLOATING_BUTTON_TABS_KEY]: tabs });
}

export async function getContextTranslationEnabled(): Promise<boolean> {
  ensureChromeStorage();
  const result = await chrome.storage.local.get(CONTEXT_TRANSLATION_KEY);
  return Boolean(result[CONTEXT_TRANSLATION_KEY]);
}

export async function setContextTranslationEnabled(
  enabled: boolean
): Promise<void> {
  ensureChromeStorage();
  await chrome.storage.local.set({ [CONTEXT_TRANSLATION_KEY]: enabled });
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

export async function getDictionaryState(): Promise<DictionaryState> {
  ensureChromeStorage();
  const result = await chrome.storage.local.get([
    DICTIONARY_FILES_KEY,
    ACTIVE_DICTIONARY_KEY
  ]);
  const files = normalizeDictionaryFiles(result[DICTIONARY_FILES_KEY]);
  const storedActiveId =
    typeof result[ACTIVE_DICTIONARY_KEY] === 'string'
      ? result[ACTIVE_DICTIONARY_KEY]
      : null;

  return {
    files,
    activeDictionaryId: files.some((file) => file.id === storedActiveId)
      ? storedActiveId
      : null
  };
}

export async function saveDictionaryFiles(
  files: DictionaryFile[]
): Promise<void> {
  ensureChromeStorage();
  if (files.length > MAX_DICTIONARY_FILES) {
    throw new Error(`字典檔最多 ${MAX_DICTIONARY_FILES} 個。`);
  }

  const normalized = files.map((file) => {
    if (!file.title.trim()) throw new Error('字典檔標題不可空白。');
    if (file.entries.length > MAX_DICTIONARY_ENTRIES) {
      throw new Error(
        `每個字典檔最多 ${MAX_DICTIONARY_ENTRIES} 筆詞條。`
      );
    }
    return {
      ...file,
      title: file.title.trim(),
      entries: file.entries.map((entry) => ({
        ...entry,
        origin: entry.origin.trim(),
        value: entry.value.trim(),
        type: entry.type.trim(),
        note: entry.note.trim()
      }))
    };
  });

  await chrome.storage.local.set({ [DICTIONARY_FILES_KEY]: normalized });
}

export async function setActiveDictionaryId(
  dictionaryId: string | null
): Promise<void> {
  ensureChromeStorage();
  const { files } = await getDictionaryState();
  if (
    dictionaryId !== null &&
    !files.some((dictionary) => dictionary.id === dictionaryId)
  ) {
    throw new Error('找不到要啟用的字典檔。');
  }
  await chrome.storage.local.set({ [ACTIVE_DICTIONARY_KEY]: dictionaryId });
}

export function subscribeToDictionaryState(
  listener: (state: DictionaryState) => void
) {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (
      areaName !== 'local' ||
      (!changes[DICTIONARY_FILES_KEY] && !changes[ACTIVE_DICTIONARY_KEY])
    ) {
      return;
    }
    void getDictionaryState().then(listener);
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}

function normalizeDictionaryFiles(value: unknown): DictionaryFile[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (file): file is Record<string, unknown> =>
        typeof file === 'object' && file !== null
    )
    .slice(0, MAX_DICTIONARY_FILES)
    .map((file) => {
      const now = new Date().toISOString();
      const entries = Array.isArray(file.entries)
        ? file.entries
            .filter(
              (entry): entry is Record<string, unknown> =>
                typeof entry === 'object' && entry !== null
            )
            .slice(0, MAX_DICTIONARY_ENTRIES)
            .map((entry) => ({
              id:
                typeof entry.id === 'string'
                  ? entry.id
                  : crypto.randomUUID(),
              origin: String(entry.origin || ''),
              value: String(entry.value || ''),
              type: String(entry.type || ''),
              note: String(entry.note || '')
            }))
        : [];

      return {
        id: typeof file.id === 'string' ? file.id : crypto.randomUUID(),
        title: String(file.title || '未命名字典'),
        entries,
        createdAt: typeof file.createdAt === 'string' ? file.createdAt : now,
        updatedAt: typeof file.updatedAt === 'string' ? file.updatedAt : now
      };
    });
}

function normalizeFloatingButtonTabs(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, enabled]) => /^\d+$/.test(key) && enabled === true
    )
  );
}
