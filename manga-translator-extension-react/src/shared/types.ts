export const OPENAI_MODELS = [
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
] as const;

export type OpenAiModel = (typeof OPENAI_MODELS)[number];

export const UI_LANGUAGES = ['zh-TW', 'zh-CN', 'en', 'ko'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

export interface ExtensionSettings {
  openaiApiKey: string;
  openaiModel: OpenAiModel;
  uiLanguage: UiLanguage;
}

export interface TranslationHistoryItem {
  id: string;
  originalText: string;
  translatedText: string;
  createdAt: string;
  pageTitle?: string;
  pageUrl?: string;
}

export type MangaTranslatorMessage =
  | { type: 'MANGA_TRANSLATOR_START_SELECT' }
  | { type: 'MANGA_TRANSLATOR_CLEAR_RESULTS' }
  | { type: 'MANGA_TRANSLATOR_SET_FLOATING_BUTTON'; enabled: boolean }
  | { type: 'MANGA_TRANSLATOR_CAPTURE' };

export interface TranslationResult {
  ocrEngine?: string;
  ocrText?: string;
  romanizedText?: string;
  translatedText?: string;
  text?: string;
}

export interface DictionaryEntry {
  id: string;
  origin: string;
  value: string;
  type: string;
  note: string;
}

export interface DictionaryFile {
  id: string;
  title: string;
  entries: DictionaryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface DictionaryState {
  files: DictionaryFile[];
  activeDictionaryId: string | null;
}

export interface TranslationContextItem {
  originalText: string;
  translatedText: string;
}
