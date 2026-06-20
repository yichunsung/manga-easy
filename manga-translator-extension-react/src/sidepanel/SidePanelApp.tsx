import { useEffect, useState } from 'react';
import {
  clearTranslationHistory,
  getTranslationHistory,
  subscribeToTranslationHistory
} from '../shared/storage';
import type { TranslationHistoryItem } from '../shared/types';

export function SidePanelApp() {
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);

  useEffect(() => {
    void getTranslationHistory().then(setHistory);
    return subscribeToTranslationHistory(setHistory);
  }, []);

  return (
    <main className="panel-shell">
      <p className="eyebrow">MANGA TRANSLATOR</p>
      <div className="heading">
        <h1>翻譯紀錄</h1>
        <button
          className="clear-button"
          type="button"
          disabled={history.length === 0}
          onClick={clearTranslationHistory}
        >
          清除全部
        </button>
      </div>
      <p className="description">
        完成框選翻譯後，原文與翻譯內容會自動儲存在這裡。
      </p>

      {history.length === 0 ? (
        <p className="empty-state">目前還沒有翻譯紀錄。</p>
      ) : (
        <section className="history-list" aria-live="polite">
          {history.map((item) => (
            <article className="history-card" key={item.id}>
              <time className="history-time" dateTime={item.createdAt}>
                {formatDate(item.createdAt)}
              </time>
              <p className="field-label">原文</p>
              <p className="history-text original-text">{item.originalText}</p>
              <p className="field-label">翻譯</p>
              <p className="history-text translated-text">
                {item.translatedText}
              </p>
              {item.pageTitle && (
                <a
                  className="history-source"
                  href={item.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={item.pageUrl}
                >
                  {item.pageTitle}
                </a>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
