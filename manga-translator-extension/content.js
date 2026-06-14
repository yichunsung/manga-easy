const API_URL = 'http://localhost:8787/translate-image';

let selecting = false;
let startX = 0;
let startY = 0;
let box = null;

initializeFloatingButton();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.floatingButtonEnabled) return;
  setFloatingButtonVisible(changes.floatingButtonEnabled.newValue);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'MANGA_TRANSLATOR_START_SELECT') {
    startSelectionMode();
  }

  if (message.type === 'MANGA_TRANSLATOR_CLEAR_RESULTS') {
    clearResults();
  }

  if (message.type === 'MANGA_TRANSLATOR_SET_FLOATING_BUTTON') {
    setFloatingButtonVisible(message.enabled);
  }
});

function clearResults() {
  document.querySelectorAll('.manga-translator-result').forEach((el) => el.remove());
}

async function initializeFloatingButton() {
  const { floatingButtonEnabled = false } = await chrome.storage.local.get(
    'floatingButtonEnabled'
  );
  setFloatingButtonVisible(floatingButtonEnabled);
}

function setFloatingButtonVisible(enabled) {
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

function showToast(text, duration = 2200) {
  const old = document.querySelector('.manga-translator-toast');
  old?.remove();

  const el = document.createElement('div');
  el.className = 'manga-translator-toast';
  el.textContent = text;
  document.body.appendChild(el);

  if (duration > 0) {
    setTimeout(() => el.remove(), duration);
  }

  return el;
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
  box?.remove();
  box = null;
}

function onMouseDown(e) {
  if (
    e.button !== 0 ||
    e.target.closest('#manga-translator-floating-button')
  ) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  selecting = true;
  startX = e.clientX;
  startY = e.clientY;

  box = document.createElement('div');
  box.id = 'manga-translator-selection-box';
  document.body.appendChild(box);
  updateBox(startX, startY, startX, startY);

  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('mouseup', onMouseUp, true);
}

function onMouseMove(e) {
  if (!selecting) return;
  e.preventDefault();
  e.stopPropagation();
  updateBox(startX, startY, e.clientX, e.clientY);
}

async function onMouseUp(e) {
  if (!selecting) return;
  e.preventDefault();
  e.stopPropagation();

  const rect = getNormalizedRect(startX, startY, e.clientX, e.clientY);
  stopSelectionMode();

  if (rect.width < 8 || rect.height < 8) {
    showToast('框選範圍太小');
    return;
  }

  const loadingToast = showToast('辨識與翻譯中...', 0);
  let result;

  try {
    const imageBase64 = await captureAndCrop(rect);
    result = await translateImage(imageBase64);
  } catch (error) {
    result = { translatedText: `失敗：${error.message || error}` };
  } finally {
    loadingToast.remove();
  }

  showResult(rect, result);
}

function updateBox(x1, y1, x2, y2) {
  const rect = getNormalizedRect(x1, y1, x2, y2);
  Object.assign(box.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  });
}

function getNormalizedRect(x1, y1, x2, y2) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  return {
    left,
    top,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}

async function captureAndCrop(rect) {
  const response = await chrome.runtime.sendMessage({ type: 'MANGA_TRANSLATOR_CAPTURE' });
  if (!response?.ok) throw new Error(response?.error || '截圖失敗');

  const image = await loadImage(response.dataUrl);
  const scale = window.devicePixelRatio || 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);

  const ctx = canvas.getContext('2d');
  ctx.drawImage(
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function translateImage(imageBase64) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64 })
  });

  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function showResult(rect, result) {
  const el = document.createElement('div');
  el.className = 'manga-translator-result';
  el.style.left = `${Math.min(rect.left + rect.width + 8, window.innerWidth - 380)}px`;
  el.style.top = `${Math.max(12, rect.top)}px`;

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
  close.onclick = () => el.remove();

  const content = document.createElement('div');
  content.className = 'manga-translator-result-content';

  const originalText = document.createElement('div');
  originalText.className = 'manga-translator-result-line';
  originalText.textContent = `${formatResultText(
    result.ocrText || '無辨識結果'
  )}`;

  const romanizedText = document.createElement('div');
  romanizedText.className =
    'manga-translator-result-line manga-translator-result-romanized is-hidden';
  romanizedText.textContent = result.romanizedText || '無羅馬拼音';

  toggleRomanized.onclick = () => {
    const hidden = romanizedText.classList.toggle('is-hidden');
    toggleRomanized.textContent = hidden
      ? '顯示羅馬拼音'
      : '隱藏羅馬拼音';
  };

  const translatedText = document.createElement('div');
  translatedText.className = 'manga-translator-result-line';
  translatedText.textContent = `${formatResultText(
    result.translatedText || result.text || '沒有翻譯結果'
  )}`;

  content.appendChild(originalText);
  content.appendChild(romanizedText);
  content.appendChild(translatedText);

  actions.appendChild(toggleRomanized);
  actions.appendChild(close);
  el.appendChild(actions);
  el.appendChild(content);
  document.body.appendChild(el);
  makeDraggable(el);
}

function makeDraggable(el) {
  el.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;

    event.preventDefault();
    event.stopPropagation();

    const startLeft = el.offsetLeft;
    const startTop = el.offsetTop;
    const startX = event.clientX;
    const startY = event.clientY;

    el.classList.add('is-dragging');

    function onDrag(moveEvent) {
      moveEvent.preventDefault();

      const maxLeft = Math.max(0, window.innerWidth - el.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - el.offsetHeight);
      const nextLeft = startLeft + moveEvent.clientX - startX;
      const nextTop = startTop + moveEvent.clientY - startY;

      el.style.left = `${Math.min(Math.max(0, nextLeft), maxLeft)}px`;
      el.style.top = `${Math.min(Math.max(0, nextTop), maxTop)}px`;
    }

    function stopDragging() {
      el.classList.remove('is-dragging');
      window.removeEventListener('mousemove', onDrag, true);
      window.removeEventListener('mouseup', stopDragging, true);
    }

    window.addEventListener('mousemove', onDrag, true);
    window.addEventListener('mouseup', stopDragging, true);
  });
}

function formatResultText(value) {
  return String(value)
    .trim()
    .replace(/([。])\s*/g, '$1\n')
    // .replace(/([^.])\.(?!\.)\s*/g, '$1.\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
