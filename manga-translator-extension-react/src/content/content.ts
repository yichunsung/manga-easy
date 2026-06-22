import type {
  MangaTranslatorMessage,
  TranslationHistoryItem,
  TranslationResult,
  UiLanguage
} from '../shared/types';
import './content.css';

const API_URL = 'http://localhost:8787/translate-image';
const HISTORY_KEY = 'translationHistory';
const MAX_HISTORY = 100;
const API_KEY_KEY = 'openaiApiKey';
const MODEL_KEY = 'openaiModel';
const DEFAULT_MODEL = 'gpt-5.4-mini';
const DICTIONARY_FILES_KEY = 'dictionaryFiles';
const ACTIVE_DICTIONARY_KEY = 'activeDictionaryId';
const CONTEXT_TRANSLATION_KEY = 'contextTranslationEnabled';
const UI_LANGUAGE_KEY = 'uiLanguage';

let uiLanguage: UiLanguage = 'zh-TW';

const contentMessages = {
  'zh-TW': {
    floatingButton: '框選翻譯',
    startSelection: '框選翻譯',
    selectArea: '請拖曳框選漫畫文字區域',
    areaTooSmall: '框選範圍太小',
    translating: '辨識與翻譯中...',
    showRomanized: '顯示羅馬拼音',
    hideRomanized: '隱藏羅馬拼音',
    noOcr: '無辨識結果',
    noRomanized: '無羅馬拼音',
    noTranslation: '沒有翻譯結果'
  },
  'zh-CN': {
    floatingButton: '框选翻译',
    startSelection: '框选翻译',
    selectArea: '请拖动框选漫画文字区域',
    areaTooSmall: '框选范围太小',
    translating: '识别与翻译中...',
    showRomanized: '显示罗马拼音',
    hideRomanized: '隐藏罗马拼音',
    noOcr: '无识别结果',
    noRomanized: '无罗马拼音',
    noTranslation: '没有翻译结果'
  },
  en: {
    floatingButton: 'Select and translate',
    startSelection: 'Select and translate',
    selectArea: 'Drag to select manga text',
    areaTooSmall: 'Selection is too small',
    translating: 'Recognizing and translating...',
    showRomanized: 'Show romanization',
    hideRomanized: 'Hide romanization',
    noOcr: 'No OCR result',
    noRomanized: 'No romanization',
    noTranslation: 'No translation result'
  },
  ko: {
    floatingButton: '영역 선택 번역',
    startSelection: '영역 선택 번역',
    selectArea: '만화 텍스트 영역을 드래그하세요',
    areaTooSmall: '선택 영역이 너무 작습니다',
    translating: '인식 및 번역 중...',
    showRomanized: '로마자 표시',
    hideRomanized: '로마자 숨기기',
    noOcr: '인식 결과 없음',
    noRomanized: '로마자 없음',
    noTranslation: '번역 결과 없음'
  }
} as const;

function getContentMessages(language: UiLanguage) {
  return contentMessages[language] || contentMessages['zh-TW'];
}

interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CaptureResponse {
  ok: boolean;
  dataUrl?: string;
  error?: string;
}

let selecting = false;
let startX = 0;
let startY = 0;
let selectionBox: HTMLDivElement | null = null;
let selectionOverlay: HTMLDivElement | null = null;
let activeTranslationTasks = 0;
let sharedLoadingToast: HTMLDivElement | null = null;

void initializeContentSettings();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.uiLanguage?.newValue) {
    uiLanguage = changes.uiLanguage.newValue as UiLanguage;
    const floatingButton = document.querySelector(
      '#manga-translator-floating-button'
    );
    if (floatingButton) {
      floatingButton.textContent = getContentMessages(uiLanguage).floatingButton;
    }
  }
});

chrome.runtime.onMessage.addListener((message: MangaTranslatorMessage) => {
  if (message.type === 'MANGA_TRANSLATOR_START_SELECT') {
    startSelectionMode();
  } else if (message.type === 'MANGA_TRANSLATOR_CLEAR_RESULTS') {
    clearResults();
  } else if (message.type === 'MANGA_TRANSLATOR_SET_FLOATING_BUTTON') {
    setFloatingButtonVisible(message.enabled);
  }
});

function clearResults() {
  document
    .querySelectorAll('.manga-translator-result')
    .forEach((element) => element.remove());
}

async function initializeContentSettings() {
  const { uiLanguage: storedLanguage = 'zh-TW' } =
    await chrome.storage.local.get(UI_LANGUAGE_KEY);
  uiLanguage = storedLanguage as UiLanguage;

  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'MANGA_TRANSLATOR_GET_FLOATING_BUTTON_STATE'
    } satisfies MangaTranslatorMessage)) as {
      ok?: boolean;
      enabled?: boolean;
    };
    setFloatingButtonVisible(Boolean(response?.ok && response.enabled));
  } catch (error) {
    console.error('無法取得目前分頁的常駐按鈕狀態', error);
    setFloatingButtonVisible(false);
  }
}

function setFloatingButtonVisible(enabled: boolean) {
  document.querySelector('#manga-translator-floating-button')?.remove();
  if (!enabled) return;

  const button = document.createElement('button');
  button.id = 'manga-translator-floating-button';
  button.type = 'button';
  button.textContent = getContentMessages(uiLanguage).floatingButton;
  button.title = getContentMessages(uiLanguage).startSelection;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    startSelectionMode();
  });
  document.body.appendChild(button);
}

function showToast(text: string, duration = 2200) {
  const existingToast = document.querySelector<HTMLDivElement>(
    '.manga-translator-toast'
  );
  if (existingToast) return existingToast;

  const element = document.createElement('div');
  element.className = 'manga-translator-toast';
  element.textContent = text;
  document.body.appendChild(element);

  if (duration > 0) {
    window.setTimeout(() => element.remove(), duration);
  }

  return element;
}

function startSelectionMode() {
  stopSelectionMode();
  showToast(getContentMessages(uiLanguage).selectArea);

  selectionOverlay = document.createElement('div');
  selectionOverlay.id = 'manga-translator-selection-overlay';
  selectionOverlay.addEventListener('mousedown', onMouseDown, true);
  document.documentElement.appendChild(selectionOverlay);

  moveExtensionUiAboveOverlay();

  window.addEventListener('keydown', onSelectionKeyDown, true);
}

function moveExtensionUiAboveOverlay() {
  document
    .querySelectorAll<HTMLElement>(
      [
        '#manga-translator-floating-button',
        '.manga-translator-result',
        '.manga-translator-toast'
      ].join(',')
    )
    .forEach((element) => document.documentElement.appendChild(element));
}

function stopSelectionMode(options: { keepOverlay?: boolean } = {}) {
  document.documentElement.style.cursor = '';
  document.body.style.cursor = '';
  if (options.keepOverlay && selectionOverlay) {
    selectionOverlay.classList.add('is-capturing');
  }
  selectionOverlay?.removeEventListener('mousedown', onMouseDown, true);
  window.removeEventListener('mousemove', onMouseMove, true);
  window.removeEventListener('mouseup', onMouseUp, true);
  window.removeEventListener('keydown', onSelectionKeyDown, true);
  selecting = false;
  selectionBox?.remove();
  selectionBox = null;

  if (!options.keepOverlay) {
    selectionOverlay?.remove();
    selectionOverlay = null;
  }
}

function onSelectionKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  document
    .querySelector(
      '.manga-translator-toast:not(.manga-translator-shared-loading)'
    )
    ?.remove();
  stopSelectionMode();
}

function onMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;

  event.preventDefault();
  event.stopPropagation();
  selecting = true;
  startX = event.clientX;
  startY = event.clientY;

  selectionBox = document.createElement('div');
  selectionBox.id = 'manga-translator-selection-box';
  document.documentElement.appendChild(selectionBox);
  updateBox(startX, startY, startX, startY);

  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('mouseup', onMouseUp, true);
}

function onMouseMove(event: MouseEvent) {
  if (!selecting) return;
  event.preventDefault();
  event.stopPropagation();
  updateBox(startX, startY, event.clientX, event.clientY);
}

async function onMouseUp(event: MouseEvent) {
  if (!selecting) return;
  event.preventDefault();
  event.stopPropagation();

  const rect = getNormalizedRect(
    startX,
    startY,
    event.clientX,
    event.clientY
  );
  const completedOverlay = selectionOverlay;
  stopSelectionMode({ keepOverlay: true });

  if (rect.width < 8 || rect.height < 8) {
    removeSelectionOverlay(completedOverlay);
    showToast(getContentMessages(uiLanguage).areaTooSmall);
    return;
  }

  try {
    const imageBase64 = await captureAndCrop(rect);
    removeSelectionOverlay(completedOverlay);
    void runTranslationTask(rect, imageBase64);
  } catch (error) {
    removeSelectionOverlay(completedOverlay);
    const message = error instanceof Error ? error.message : String(error);
    showResult(rect, { translatedText: `失敗：${message}` });
  }
}

async function runTranslationTask(
  rect: SelectionRect,
  imageBase64: string
) {
  beginTranslationTask();
  let result: TranslationResult;

  try {
    result = await translateImage(imageBase64);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = { translatedText: `失敗：${message}` };
  } finally {
    finishTranslationTask();
  }

  showResult(rect, result);
  await saveTranslationHistory(result);
}

function beginTranslationTask() {
  activeTranslationTasks += 1;
  if (sharedLoadingToast?.isConnected) return;
  if (document.querySelector('.manga-translator-toast')) return;

  sharedLoadingToast = document.createElement('div');
  sharedLoadingToast.className =
    'manga-translator-toast manga-translator-shared-loading';
  sharedLoadingToast.textContent = getContentMessages(uiLanguage).translating;
  document.documentElement.appendChild(sharedLoadingToast);
}

function finishTranslationTask() {
  activeTranslationTasks = Math.max(0, activeTranslationTasks - 1);
  if (activeTranslationTasks > 0) return;

  sharedLoadingToast?.remove();
  sharedLoadingToast = null;
}

function removeSelectionOverlay(
  overlay: HTMLDivElement | null = selectionOverlay
) {
  overlay?.remove();
  document.documentElement.style.cursor = '';
  document.body.style.cursor = '';
  if (selectionOverlay === overlay) {
    selectionOverlay = null;
  }
}

function updateBox(x1: number, y1: number, x2: number, y2: number) {
  if (!selectionBox) return;
  const rect = getNormalizedRect(x1, y1, x2, y2);
  Object.assign(selectionBox.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  });
}

function getNormalizedRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): SelectionRect {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}

async function captureAndCrop(rect: SelectionRect) {
  const response = (await chrome.runtime.sendMessage({
    type: 'MANGA_TRANSLATOR_CAPTURE'
  } satisfies MangaTranslatorMessage)) as CaptureResponse;

  if (!response?.ok || !response.dataUrl) {
    throw new Error(response?.error || '截圖失敗');
  }

  const image = await loadImage(response.dataUrl);
  const scale = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('無法建立圖片畫布');

  context.drawImage(
    image,
    Math.round(rect.left * scale),
    Math.round(rect.top * scale),
    Math.round(rect.width * scale),
    Math.round(rect.height * scale),
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas.toDataURL('image/png');
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('圖片載入失敗'));
    image.src = src;
  });
}

async function translateImage(imageBase64: string): Promise<TranslationResult> {
  const settings = await chrome.storage.local.get([
    API_KEY_KEY,
    MODEL_KEY,
    DICTIONARY_FILES_KEY,
    ACTIVE_DICTIONARY_KEY,
    CONTEXT_TRANSLATION_KEY,
    HISTORY_KEY,
    UI_LANGUAGE_KEY
  ]);
  const apiKey = String(settings[API_KEY_KEY] || '').trim();
  const model = String(settings[MODEL_KEY] || DEFAULT_MODEL);
  const targetLanguage = (settings[UI_LANGUAGE_KEY] || 'zh-TW') as UiLanguage;
  const activeDictionaryId = settings[ACTIVE_DICTIONARY_KEY];
  const dictionaryFiles = Array.isArray(settings[DICTIONARY_FILES_KEY])
    ? settings[DICTIONARY_FILES_KEY]
    : [];
  const activeDictionary = dictionaryFiles.find(
    (dictionary: { id?: unknown }) => dictionary?.id === activeDictionaryId
  );
  const dictionaryEntries = Array.isArray(activeDictionary?.entries)
    ? activeDictionary.entries.slice(0, 50).map(
        (entry: {
          origin?: unknown;
          value?: unknown;
          type?: unknown;
          note?: unknown;
        }) => ({
          origin: String(entry.origin || ''),
          value: String(entry.value || ''),
          type: String(entry.type || ''),
          note: String(entry.note || '')
        })
      )
    : [];
  const contextTranslationEnabled = Boolean(
    settings[CONTEXT_TRANSLATION_KEY]
  );
  const translationContext = contextTranslationEnabled &&
    Array.isArray(settings[HISTORY_KEY])
    ? settings[HISTORY_KEY]
        .slice(0, 5)
        .reverse()
        .map(
          (item: {
            originalText?: unknown;
            translatedText?: unknown;
          }) => ({
            originalText: String(item.originalText || ''),
            translatedText: String(item.translatedText || '')
          })
        )
        .filter(
          (item: { originalText: string; translatedText: string }) =>
            item.originalText && item.translatedText
        )
    : [];

  if (!apiKey) {
    throw new Error('請先在擴充功能 Popup 的設定頁輸入 OpenAI API Key');
  }

  const requestBody: Record<string, unknown> = {
    imageBase64,
    apiKey,
    model,
    dictionaryTitle: String(activeDictionary?.title || ''),
    dictionaryEntries,
    targetLanguage
  };

  if (contextTranslationEnabled) {
    requestBody.contextTranslationEnabled = true;
    requestBody.translationContext = translationContext;
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { detail?: string; error?: string }
      | null;
    throw new Error(
      errorBody?.detail || errorBody?.error || `API ${response.status}`
    );
  }

  const result = (await response.json()) as TranslationResult;
  if (result.ocrEngine !== 'manga-ocr') {
    throw new Error('後端未使用 MangaOCR，已拒絕此翻譯結果');
  }
  return result;
}

async function saveTranslationHistory(result: TranslationResult) {
  const originalText = String(result.ocrText || '').trim();
  const translatedText = String(
    result.translatedText || result.text || ''
  ).trim();

  if (!originalText || !translatedText || translatedText.startsWith('失敗：')) {
    return;
  }

  try {
    const stored = await chrome.storage.local.get(HISTORY_KEY);
    const history: TranslationHistoryItem[] = Array.isArray(stored[HISTORY_KEY])
      ? stored[HISTORY_KEY]
      : [];
    const item: TranslationHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      originalText,
      translatedText,
      createdAt: new Date().toISOString(),
      pageTitle: document.title,
      pageUrl: location.href
    };

    await chrome.storage.local.set({
      [HISTORY_KEY]: [item, ...history].slice(0, MAX_HISTORY)
    });
  } catch (error) {
    console.error('無法儲存翻譯紀錄', error);
  }
}

function showResult(rect: SelectionRect, result: TranslationResult) {
  const element = document.createElement('div');
  element.className = 'manga-translator-result';
  element.style.left = `${Math.min(
    rect.left + rect.width + 8,
    window.innerWidth - 380
  )}px`;
  element.style.top = `${Math.max(12, rect.top)}px`;

  const actions = document.createElement('div');
  actions.className = 'manga-translator-result-actions';
  const toggleRomanized = document.createElement('button');
  toggleRomanized.className = 'manga-translator-romanized-toggle';
  toggleRomanized.type = 'button';
  const messages = getContentMessages(uiLanguage);
  toggleRomanized.textContent = messages.showRomanized;
  const close = document.createElement('button');
  close.className = 'manga-translator-result-close';
  close.type = 'button';
  close.textContent = '×';
  close.onclick = () => element.remove();
  const content = document.createElement('div');
  content.className = 'manga-translator-result-content';
  const originalText = document.createElement('div');
  originalText.className = 'manga-translator-result-line';
  originalText.textContent = formatResultText(
    result.ocrText || messages.noOcr
  );
  const romanizedText = document.createElement('div');
  romanizedText.className =
    'manga-translator-result-line manga-translator-result-romanized is-hidden';
  romanizedText.textContent = result.romanizedText || messages.noRomanized;
  toggleRomanized.onclick = () => {
    const hidden = romanizedText.classList.toggle('is-hidden');
    toggleRomanized.textContent = hidden
      ? messages.showRomanized
      : messages.hideRomanized;
  };
  const translatedText = document.createElement('div');
  translatedText.className = 'manga-translator-result-line';
  translatedText.textContent = formatResultText(
    result.translatedText || result.text || messages.noTranslation
  );

  content.append(originalText, romanizedText, translatedText);
  actions.append(toggleRomanized, close);
  element.append(actions, content);
  document.documentElement.appendChild(element);
  makeDraggable(element);
}

function makeDraggable(element: HTMLDivElement) {
  element.addEventListener('mousedown', (event) => {
    const target = event.target;
    if (
      event.button !== 0 ||
      (target instanceof Element && target.closest('button'))
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const startLeft = element.offsetLeft;
    const startTop = element.offsetTop;
    const dragStartX = event.clientX;
    const dragStartY = event.clientY;
    element.classList.add('is-dragging');

    function onDrag(moveEvent: MouseEvent) {
      moveEvent.preventDefault();
      const maxLeft = Math.max(0, window.innerWidth - element.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - element.offsetHeight);
      const nextLeft = startLeft + moveEvent.clientX - dragStartX;
      const nextTop = startTop + moveEvent.clientY - dragStartY;
      element.style.left = `${Math.min(Math.max(0, nextLeft), maxLeft)}px`;
      element.style.top = `${Math.min(Math.max(0, nextTop), maxTop)}px`;
    }

    function stopDragging() {
      element.classList.remove('is-dragging');
      window.removeEventListener('mousemove', onDrag, true);
      window.removeEventListener('mouseup', stopDragging, true);
    }

    window.addEventListener('mousemove', onDrag, true);
    window.addEventListener('mouseup', stopDragging, true);
  });
}

function formatResultText(value: string) {
  return String(value)
    .trim()
    .replace(/([。])\s*/g, '$1\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
