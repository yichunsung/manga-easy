const TRANSLATION_HISTORY_KEY = 'translationHistory';

const historyList = document.querySelector('#history-list');
const emptyState = document.querySelector('#empty-state');
const clearHistoryButton = document.querySelector('#clear-history');

loadTranslationHistory();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[TRANSLATION_HISTORY_KEY]) return;
  renderTranslationHistory(changes[TRANSLATION_HISTORY_KEY].newValue || []);
});

clearHistoryButton.addEventListener('click', async () => {
  await chrome.storage.local.remove(TRANSLATION_HISTORY_KEY);
});

async function loadTranslationHistory() {
  const stored = await chrome.storage.local.get(TRANSLATION_HISTORY_KEY);
  renderTranslationHistory(stored[TRANSLATION_HISTORY_KEY] || []);
}

function renderTranslationHistory(history) {
  historyList.replaceChildren();
  emptyState.hidden = history.length > 0;
  clearHistoryButton.disabled = history.length === 0;

  history.forEach((item) => {
    historyList.appendChild(createHistoryCard(item));
  });
}

function createHistoryCard(item) {
  const card = document.createElement('article');
  card.className = 'history-card';

  const time = document.createElement('time');
  time.className = 'history-time';
  time.dateTime = item.createdAt;
  time.textContent = formatDate(item.createdAt);

  const originalLabel = document.createElement('p');
  originalLabel.className = 'field-label';
  originalLabel.textContent = '原文';

  const originalText = document.createElement('p');
  originalText.className = 'history-text original-text';
  originalText.textContent = item.originalText;

  const translatedLabel = document.createElement('p');
  translatedLabel.className = 'field-label';
  translatedLabel.textContent = '翻譯';

  const translatedText = document.createElement('p');
  translatedText.className = 'history-text translated-text';
  translatedText.textContent = item.translatedText;

  card.append(
    time,
    originalLabel,
    originalText,
    translatedLabel,
    translatedText
  );

  if (item.pageTitle) {
    const source = document.createElement('a');
    source.className = 'history-source';
    source.href = item.pageUrl;
    source.target = '_blank';
    source.rel = 'noreferrer';
    source.textContent = item.pageTitle;
    source.title = item.pageUrl;
    card.appendChild(source);
  }

  return card;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
