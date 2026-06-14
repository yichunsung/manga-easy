const API_URL = 'http://localhost:8787/translate-image';

let selecting = false;
let startX = 0;
let startY = 0;
let box = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'MANGA_TRANSLATOR_START_SELECT') {
    startSelectionMode();
  }
});

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
  if (e.button !== 0) return;
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

  const close = document.createElement('button');
  close.textContent = '×';
  close.onclick = () => el.remove();

  const text = document.createElement('div');
  text.textContent = formatResultText(
    result.translatedText || result.text || '沒有翻譯結果'
  );

  el.appendChild(close);
  el.appendChild(text);
  document.body.appendChild(el);
}

function formatResultText(value) {
  return String(value)
    .trim()
    .replace(/([。．])\s*/g, '$1\n')
    .replace(/([^.])\.(?!\.)\s*/g, '$1.\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
