import type {
  MangaTranslatorMessage,
  TranslationHistoryItem,
  TranslationResult
} from '../shared/types';
import './content.css';

const API_URL = 'http://localhost:8787/translate-image';
const HISTORY_KEY = 'translationHistory';
const MAX_HISTORY = 100;
const API_KEY_KEY = 'openaiApiKey';
const MODEL_KEY = 'openaiModel';
const DEFAULT_MODEL = 'gpt-5.4-mini';

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

void initializeFloatingButton();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.floatingButtonEnabled) return;
  setFloatingButtonVisible(Boolean(changes.floatingButtonEnabled.newValue));
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

async function initializeFloatingButton() {
  const { floatingButtonEnabled = false } = await chrome.storage.local.get(
    'floatingButtonEnabled'
  );
  setFloatingButtonVisible(Boolean(floatingButtonEnabled));
}

function setFloatingButtonVisible(enabled: boolean) {
  document.querySelector('#manga-translator-floating-button')?.remove();
  if (!enabled) return;

  const button = document.createElement('button');
  button.id = 'manga-translator-floating-button';
  button.type = 'button';
  button.textContent = '框選翻譯';
  button.title = '框選漫畫文字並翻譯';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    startSelectionMode();
  });
  document.body.appendChild(button);
}

function showToast(text: string, duration = 2200) {
  document.querySelector('.manga-translator-toast')?.remove();

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
  showToast('請拖曳框選漫畫文字區域');
  document.body.style.cursor = 'crosshair';
  window.addEventListener('mousedown', onMouseDown, true);
}

function stopSelectionMode() {
  document.body.style.cursor = '';
  window.removeEventListener('mousedown', onMouseDown, true);
  window.removeEventListener('mousemove', onMouseMove, true);
  window.removeEventListener('mouseup', onMouseUp, true);
  selecting = false;
  selectionBox?.remove();
  selectionBox = null;
}

function onMouseDown(event: MouseEvent) {
  const target = event.target;
  if (
    event.button !== 0 ||
    (target instanceof Element &&
      target.closest('#manga-translator-floating-button'))
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  selecting = true;
  startX = event.clientX;
  startY = event.clientY;

  selectionBox = document.createElement('div');
  selectionBox.id = 'manga-translator-selection-box';
  document.body.appendChild(selectionBox);
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
  stopSelectionMode();

  if (rect.width < 8 || rect.height < 8) {
    showToast('框選範圍太小');
    return;
  }

  const loadingToast = showToast('辨識與翻譯中...', 0);
  let result: TranslationResult;

  try {
    const imageBase64 = await captureAndCrop(rect);
    result = await translateImage(imageBase64);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = { translatedText: `失敗：${message}` };
  } finally {
    loadingToast.remove();
  }

  showResult(rect, result);
  await saveTranslationHistory(result);
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
  const settings = await chrome.storage.local.get([API_KEY_KEY, MODEL_KEY]);
  const apiKey = String(settings[API_KEY_KEY] || '').trim();
  const model = String(settings[MODEL_KEY] || DEFAULT_MODEL);

  if (!apiKey) {
    throw new Error('請先在擴充功能 Popup 的設定頁輸入 OpenAI API Key');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, apiKey, model })
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
  toggleRomanized.textContent = '顯示羅馬拼音';
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
    result.ocrText || '無辨識結果'
  );
  const romanizedText = document.createElement('div');
  romanizedText.className =
    'manga-translator-result-line manga-translator-result-romanized is-hidden';
  romanizedText.textContent = result.romanizedText || '無羅馬拼音';
  toggleRomanized.onclick = () => {
    const hidden = romanizedText.classList.toggle('is-hidden');
    toggleRomanized.textContent = hidden ? '顯示羅馬拼音' : '隱藏羅馬拼音';
  };
  const translatedText = document.createElement('div');
  translatedText.className = 'manga-translator-result-line';
  translatedText.textContent = formatResultText(
    result.translatedText || result.text || '沒有翻譯結果'
  );

  content.append(originalText, romanizedText, translatedText);
  actions.append(toggleRomanized, close);
  element.append(actions, content);
  document.body.appendChild(element);
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
