import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  clearTranslationHistory,
  deleteTranslationHistoryItem,
  getDictionaryState,
  getContextTranslationEnabled,
  getUiLanguage,
  getTranslationHistory,
  MAX_DICTIONARY_ENTRIES,
  MAX_DICTIONARY_FILES,
  saveDictionaryFiles,
  setActiveDictionaryId,
  setContextTranslationEnabled,
  subscribeToDictionaryState,
  subscribeToTranslationHistory
} from '../shared/storage';
import { getMessages } from '../shared/i18n';
import type {
  DictionaryEntry,
  DictionaryFile,
  TranslationHistoryItem,
  UiLanguage
} from '../shared/types';

const EMPTY_ENTRY: Omit<DictionaryEntry, 'id'> = {
  origin: '',
  value: '',
  type: '',
  note: ''
};

const DICTIONARY_TYPES = [
  { value: '', label: '未分類' },
  { value: 'character', label: '角色名' },
  { value: 'place', label: '地名' },
  { value: 'organization', label: '組織' },
  { value: 'skill', label: '招式／技能' },
  { value: 'item', label: '物品' },
  { value: 'title', label: '稱謂／職稱' },
  { value: 'sound-effect', label: '擬聲詞' },
  { value: 'other', label: '其他' }
] as const;

export function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<'history' | 'dictionaries'>(
    'history'
  );
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);
  const [contextEnabled, setContextEnabled] = useState(false);
  const [dictionaries, setDictionaries] = useState<DictionaryFile[]>([]);
  const [activeDictionaryId, setActiveId] = useState<string | null>(null);
  const [selectedDictionaryId, setSelectedDictionaryId] = useState<
    string | null
  >(null);
  const [newDictionaryTitle, setNewDictionaryTitle] = useState('');
  const [entryDraft, setEntryDraft] = useState(EMPTY_ENTRY);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>('zh-TW');
  const messages = getMessages(uiLanguage);

  const selectedDictionary = useMemo(
    () =>
      dictionaries.find(
        (dictionary) => dictionary.id === selectedDictionaryId
      ) || null,
    [dictionaries, selectedDictionaryId]
  );

  useEffect(() => {
    void getTranslationHistory().then(setHistory);
    void getContextTranslationEnabled().then(setContextEnabled);
    void getUiLanguage().then(setUiLanguage);
    void getDictionaryState().then((state) => {
      setDictionaries(state.files);
      setActiveId(state.activeDictionaryId);
    });

    const unsubscribeHistory = subscribeToTranslationHistory(setHistory);
    const unsubscribeDictionaries = subscribeToDictionaryState((state) => {
      setDictionaries(state.files);
      setActiveId(state.activeDictionaryId);
      setSelectedDictionaryId((currentId) =>
        currentId && state.files.some((file) => file.id === currentId)
          ? currentId
          : null
      );
    });
    const handleLanguageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName === 'local' && changes.uiLanguage?.newValue) {
        setUiLanguage(changes.uiLanguage.newValue as UiLanguage);
      }
    };
    chrome.storage.onChanged.addListener(handleLanguageChange);

    return () => {
      unsubscribeHistory();
      unsubscribeDictionaries();
      chrome.storage.onChanged.removeListener(handleLanguageChange);
    };
  }, []);

  async function createDictionary(event: FormEvent) {
    event.preventDefault();
    setStatus('');
    const title = newDictionaryTitle.trim();
    if (!title) {
      setStatus('請輸入字典檔標題。');
      return;
    }
    if (dictionaries.length >= MAX_DICTIONARY_FILES) {
      setStatus(`最多只能建立 ${MAX_DICTIONARY_FILES} 個字典檔。`);
      return;
    }

    const now = new Date().toISOString();
    const dictionary: DictionaryFile = {
      id: crypto.randomUUID(),
      title,
      entries: [],
      createdAt: now,
      updatedAt: now
    };

    try {
      await saveDictionaryFiles([...dictionaries, dictionary]);
      if (dictionaries.length === 0) {
        await setActiveDictionaryId(dictionary.id);
      }
      setNewDictionaryTitle('');
      setSelectedDictionaryId(dictionary.id);
      setStatus('字典檔已建立。');
    } catch (error) {
      setStatus(toErrorMessage(error));
    }
  }

  async function updateDictionaryTitle(title: string) {
    if (!selectedDictionary) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setStatus('字典檔標題不可空白。');
      return;
    }

    try {
      await replaceDictionary({
        ...selectedDictionary,
        title: trimmedTitle,
        updatedAt: new Date().toISOString()
      });
      setStatus('字典檔標題已更新。');
    } catch (error) {
      setStatus(toErrorMessage(error));
    }
  }

  async function activateDictionary(dictionaryId: string) {
    try {
      await setActiveDictionaryId(dictionaryId);
      setActiveId(dictionaryId);
      setStatus('已切換目前使用的字典檔。');
    } catch (error) {
      setStatus(toErrorMessage(error));
    }
  }

  async function deleteDictionary(dictionary: DictionaryFile) {
    if (!window.confirm(`確定要刪除「${dictionary.title}」嗎？`)) return;

    try {
      const nextFiles = dictionaries.filter(
        (item) => item.id !== dictionary.id
      );
      await saveDictionaryFiles(nextFiles);
      if (activeDictionaryId === dictionary.id) {
        await setActiveDictionaryId(null);
      }
      setSelectedDictionaryId(null);
      resetEntryForm();
      setStatus('字典檔已刪除。');
    } catch (error) {
      setStatus(toErrorMessage(error));
    }
  }

  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    if (!selectedDictionary) return;
    setStatus('');

    const normalizedDraft = {
      origin: entryDraft.origin.trim(),
      value: entryDraft.value.trim(),
      type: entryDraft.type.trim(),
      note: entryDraft.note.trim()
    };

    if (!normalizedDraft.origin || !normalizedDraft.value) {
      setStatus('原文與翻譯值為必填。');
      return;
    }

    if (
      !editingEntryId &&
      selectedDictionary.entries.length >= MAX_DICTIONARY_ENTRIES
    ) {
      setStatus(`每個字典檔最多 ${MAX_DICTIONARY_ENTRIES} 筆詞條。`);
      return;
    }

    const entries = editingEntryId
      ? selectedDictionary.entries.map((entry) =>
          entry.id === editingEntryId
            ? { ...entry, ...normalizedDraft }
            : entry
        )
      : [
          ...selectedDictionary.entries,
          { id: crypto.randomUUID(), ...normalizedDraft }
        ];

    try {
      await replaceDictionary({
        ...selectedDictionary,
        entries,
        updatedAt: new Date().toISOString()
      });
      resetEntryForm();
      setStatus(editingEntryId ? '詞條已更新。' : '詞條已新增。');
    } catch (error) {
      setStatus(toErrorMessage(error));
    }
  }

  function editEntry(entry: DictionaryEntry) {
    setEditingEntryId(entry.id);
    setEntryDraft({
      origin: entry.origin,
      value: entry.value,
      type: entry.type,
      note: entry.note
    });
    setStatus('');
  }

  async function deleteEntry(entryId: string) {
    if (!selectedDictionary) return;
    try {
      await replaceDictionary({
        ...selectedDictionary,
        entries: selectedDictionary.entries.filter(
          (entry) => entry.id !== entryId
        ),
        updatedAt: new Date().toISOString()
      });
      if (editingEntryId === entryId) resetEntryForm();
      setStatus('詞條已刪除。');
    } catch (error) {
      setStatus(toErrorMessage(error));
    }
  }

  async function replaceDictionary(nextDictionary: DictionaryFile) {
    const nextFiles = dictionaries.map((dictionary) =>
      dictionary.id === nextDictionary.id ? nextDictionary : dictionary
    );
    await saveDictionaryFiles(nextFiles);
    setDictionaries(nextFiles);
  }

  function resetEntryForm() {
    setEntryDraft(EMPTY_ENTRY);
    setEditingEntryId(null);
  }

  return (
    <main className="panel-shell">
      <p className="eyebrow">MANGA TRANSLATOR</p>

      <nav className="panel-tabs" aria-label="側邊欄功能">
        <button
          className={activeTab === 'history' ? 'is-active' : ''}
          type="button"
          onClick={() => setActiveTab('history')}
        >
          {messages.historyTab}
        </button>
        <button
          className={activeTab === 'dictionaries' ? 'is-active' : ''}
          type="button"
          onClick={() => setActiveTab('dictionaries')}
        >
          {messages.dictionaryTab}
        </button>
      </nav>

      {activeTab === 'history' ? (
        <HistoryPanel
          history={history}
          messages={messages}
          contextEnabled={contextEnabled}
          onToggleContext={async () => {
            const enabled = !contextEnabled;
            await setContextTranslationEnabled(enabled);
            setContextEnabled(enabled);
          }}
        />
      ) : selectedDictionary ? (
        <DictionaryEditor
          dictionary={selectedDictionary}
          isActive={selectedDictionary.id === activeDictionaryId}
          entryDraft={entryDraft}
          editingEntryId={editingEntryId}
          onBack={() => {
            setSelectedDictionaryId(null);
            resetEntryForm();
            setStatus('');
          }}
          onTitleChange={updateDictionaryTitle}
          onActivate={() => activateDictionary(selectedDictionary.id)}
          onDelete={() => deleteDictionary(selectedDictionary)}
          onEntryDraftChange={setEntryDraft}
          onSaveEntry={saveEntry}
          onEditEntry={editEntry}
          onDeleteEntry={deleteEntry}
          onCancelEntry={resetEntryForm}
          messages={messages}
        />
      ) : (
        <DictionaryList
          dictionaries={dictionaries}
          messages={messages}
          activeDictionaryId={activeDictionaryId}
          newTitle={newDictionaryTitle}
          onNewTitleChange={setNewDictionaryTitle}
          onCreate={createDictionary}
          onOpen={setSelectedDictionaryId}
          onActivate={activateDictionary}
        />
      )}

      {activeTab === 'dictionaries' && (
        <p className="dictionary-status" role="status">{status}</p>
      )}
    </main>
  );
}

function HistoryPanel({
  history,
  contextEnabled,
  onToggleContext,
  messages
}: {
  history: TranslationHistoryItem[];
  contextEnabled: boolean;
  onToggleContext: () => Promise<void>;
  messages: ReturnType<typeof getMessages>;
}) {
  return (
    <>
      <div className="heading">
        <h1>{messages.historyTitle}</h1>
        <button
          className="clear-button"
          type="button"
          disabled={history.length === 0}
          onClick={clearTranslationHistory}
        >
          {messages.clearAll}
        </button>
      </div>
      <p className="description">
        {messages.historyDescription}
      </p>

      <div className="context-translation-card">
        <div>
          <strong>{messages.contextTranslation}</strong>
          <p>{messages.contextHelp}</p>
        </div>
        <button
          className={contextEnabled ? 'context-toggle is-enabled' : 'context-toggle'}
          type="button"
          aria-pressed={contextEnabled}
          onClick={() => void onToggleContext()}
        >
          {contextEnabled ? messages.enabled : messages.disabled}
        </button>
      </div>

      {history.length === 0 ? (
        <p className="empty-state">{messages.noHistory}</p>
      ) : (
        <section className="history-list" aria-live="polite">
          {history.map((item) => (
            <article className="history-card" key={item.id}>
              <div className="history-card-header">
                <time className="history-time" dateTime={item.createdAt}>
                  {formatDate(item.createdAt)}
                </time>
                <button
                  className="history-delete-button"
                  type="button"
                  aria-label={messages.delete}
                  title={messages.delete}
                  onClick={() => void deleteTranslationHistoryItem(item.id)}
                >
                  {messages.delete}
                </button>
              </div>
              <p className="field-label">{messages.original}</p>
              <p className="history-text">{item.originalText}</p>
              <p className="field-label">{messages.translation}</p>
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
    </>
  );
}

interface DictionaryListProps {
  dictionaries: DictionaryFile[];
  activeDictionaryId: string | null;
  newTitle: string;
  onNewTitleChange: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onOpen: (dictionaryId: string) => void;
  onActivate: (dictionaryId: string) => void;
  messages: ReturnType<typeof getMessages>;
}

function DictionaryList({
  dictionaries,
  activeDictionaryId,
  newTitle,
  onNewTitleChange,
  onCreate,
  onOpen,
  onActivate,
  messages
}: DictionaryListProps) {
  return (
    <>
      <div className="heading">
        <h1>{messages.dictionaryTitle}</h1>
        <span className="limit-badge">
          {dictionaries.length}/{MAX_DICTIONARY_FILES}
        </span>
      </div>
      <p className="description">
        {messages.dictionaryDescription}
      </p>

      <form className="create-dictionary-form" onSubmit={onCreate}>
        <input
          value={newTitle}
          maxLength={40}
          placeholder={messages.newDictionary}
          disabled={dictionaries.length >= MAX_DICTIONARY_FILES}
          onChange={(event) => onNewTitleChange(event.target.value)}
        />
        <button
          type="submit"
          disabled={dictionaries.length >= MAX_DICTIONARY_FILES}
        >
          {messages.add}
        </button>
      </form>

      {dictionaries.length === 0 ? (
        <p className="empty-state">{messages.noDictionary}</p>
      ) : (
        <section className="dictionary-list">
          {dictionaries.map((dictionary) => {
            const isActive = dictionary.id === activeDictionaryId;
            return (
              <article className="dictionary-card" key={dictionary.id}>
                <button
                  className="dictionary-open"
                  type="button"
                  onClick={() => onOpen(dictionary.id)}
                >
                  <span className="dictionary-title-row">
                    <strong>{dictionary.title}</strong>
                    {isActive && <span className="active-badge">{messages.active}</span>}
                  </span>
                  <span className="dictionary-meta">
                    {dictionary.entries.length}/{MAX_DICTIONARY_ENTRIES} {messages.entries}
                  </span>
                </button>
                {!isActive && (
                  <button
                    className="activate-button"
                    type="button"
                    onClick={() => onActivate(dictionary.id)}
                  >
                    {messages.setActive}
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}

interface DictionaryEditorProps {
  dictionary: DictionaryFile;
  isActive: boolean;
  entryDraft: Omit<DictionaryEntry, 'id'>;
  editingEntryId: string | null;
  onBack: () => void;
  onTitleChange: (title: string) => void;
  onActivate: () => void;
  onDelete: () => void;
  onEntryDraftChange: (entry: Omit<DictionaryEntry, 'id'>) => void;
  onSaveEntry: (event: FormEvent) => void;
  onEditEntry: (entry: DictionaryEntry) => void;
  onDeleteEntry: (entryId: string) => void;
  onCancelEntry: () => void;
  messages: ReturnType<typeof getMessages>;
}

function DictionaryEditor({
  dictionary,
  isActive,
  entryDraft,
  editingEntryId,
  onBack,
  onTitleChange,
  onActivate,
  onDelete,
  onEntryDraftChange,
  onSaveEntry,
  onEditEntry,
  onDeleteEntry,
  onCancelEntry,
  messages
}: DictionaryEditorProps) {
  const [title, setTitle] = useState(dictionary.title);

  useEffect(() => setTitle(dictionary.title), [dictionary.title]);

  return (
    <>
      <div className="editor-topbar">
        <button className="back-button" type="button" onClick={onBack}>
          ← {messages.back}
        </button>
        <span className="limit-badge">
          {dictionary.entries.length}/{MAX_DICTIONARY_ENTRIES}
        </span>
      </div>

      <div className="dictionary-title-editor">
        <input
          value={title}
          maxLength={40}
          aria-label="字典檔標題"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            if (title.trim() !== dictionary.title) {
              void onTitleChange(title);
            }
          }}
        />
        {isActive ? (
          <span className="active-badge">{messages.currentActive}</span>
        ) : (
          <button type="button" onClick={onActivate}>
            {messages.setActive}
          </button>
        )}
      </div>

      <form className="entry-form" onSubmit={onSaveEntry}>
        <h2>{editingEntryId ? messages.entryEdit : messages.entryAdd}</h2>
        <label>
          {messages.originRequired}
          <input
            value={entryDraft.origin}
            maxLength={200}
            placeholder="ミカ"
            onChange={(event) =>
              onEntryDraftChange({
                ...entryDraft,
                origin: event.target.value
              })
            }
          />
        </label>
        <label>
          {messages.valueRequired}
          <input
            value={entryDraft.value}
            maxLength={200}
            placeholder="米卡"
            onChange={(event) =>
              onEntryDraftChange({
                ...entryDraft,
                value: event.target.value
              })
            }
          />
        </label>
        <div className="entry-form-row">
          <label>
            {messages.type}
            <select
              value={entryDraft.type}
              onChange={(event) =>
                onEntryDraftChange({
                  ...entryDraft,
                  type: event.target.value
                })
              }
            >
              {DICTIONARY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {messages.note}
            <input
              value={entryDraft.note}
              maxLength={100}
              placeholder="角色名"
              onChange={(event) =>
                onEntryDraftChange({
                  ...entryDraft,
                  note: event.target.value
                })
              }
            />
          </label>
        </div>
        <div className="entry-form-actions">
          <button
            className="save-entry-button"
            type="submit"
            disabled={
              !editingEntryId &&
              dictionary.entries.length >= MAX_DICTIONARY_ENTRIES
            }
          >
            {editingEntryId ? messages.saveChanges : messages.entryAdd}
          </button>
          {editingEntryId && (
            <button type="button" onClick={onCancelEntry}>
              {messages.cancel}
            </button>
          )}
        </div>
      </form>

      {dictionary.entries.length === 0 ? (
        <p className="empty-state">{messages.noEntries}</p>
      ) : (
        <section className="entry-list">
          {dictionary.entries.map((entry, index) => (
            <article className="entry-card" key={entry.id}>
              <div className="entry-index">{index + 1}</div>
              <div className="entry-content">
                <div className="entry-language-row">
                  <span>{entry.origin}</span>
                  <span className="entry-arrow">→</span>
                  <strong>{entry.value}</strong>
                </div>
                {(entry.type || entry.note) && (
                  <p className="entry-detail">
                    {[entry.type, entry.note].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="entry-actions">
                <button type="button" onClick={() => onEditEntry(entry)}>
                  {messages.edit}
                </button>
                <button
                  className="entry-delete"
                  type="button"
                  onClick={() => onDeleteEntry(entry.id)}
                >
                  {messages.delete}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <button className="delete-dictionary-button" type="button" onClick={onDelete}>
        {messages.deleteDictionary}
      </button>
    </>
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

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
