import { FormEvent, useEffect, useState } from 'react';
import {
  clearApiKey,
  DEFAULT_SETTINGS,
  getFloatingButtonEnabled,
  getSettings,
  saveSettings,
  setFloatingButtonEnabled
} from '../shared/storage';
import { getMessages, LANGUAGE_OPTIONS } from '../shared/i18n';
import {
  OPENAI_MODELS,
  type ExtensionSettings,
  type MangaTranslatorMessage,
  type OpenAiModel,
  type UiLanguage
} from '../shared/types';

const MODEL_LABELS: Partial<Record<OpenAiModel, string>> = {
  'gpt-5.5': 'GPT-5.5（品質優先）',
  'gpt-5.4-mini': 'GPT-5.4 mini（建議）',
  'gpt-5.4-nano': 'GPT-5.4 nano（速度與成本優先）',
  'gpt-4': 'GPT-4（舊版、文字模型）',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo（舊版、文字模型）'
};

export function PopupApp() {
  const [view, setView] = useState<'menu' | 'settings'>('menu');
  const [settings, setSettings] =
    useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [floatingButtonEnabled, setFloatingEnabled] = useState(false);
  const [currentTabId, setCurrentTabId] = useState<number>();
  const [currentWindowId, setCurrentWindowId] = useState<number>();
  const [menuStatus, setMenuStatus] = useState('');
  const [settingsStatus, setSettingsStatus] = useState('');
  const messages = getMessages(settings.uiLanguage);

  useEffect(() => {
    void Promise.all([
      getSettings().then(setSettings),
      chrome.windows.getCurrent().then((window) => {
        setCurrentWindowId(window.id);
      }),
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(async ([tab]) => {
          if (tab?.id === undefined) return;
          setCurrentTabId(tab.id);
          setFloatingEnabled(await getFloatingButtonEnabled(tab.id));
        })
    ]).catch((error: Error) => setMenuStatus(error.message));
  }, []);

  async function sendToActiveTab(message: MangaTranslatorMessage) {
    setMenuStatus('');
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      if (tab?.id === undefined) throw new Error('找不到目前分頁');

      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch (error) {
        if (!isMissingContentScriptError(error)) throw error;

        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await chrome.tabs.sendMessage(tab.id, message);
      }

      window.close();
    } catch (error) {
      console.error(error);
      setMenuStatus(messages.pageUnavailable);
    }
  }

  async function handleToggleFloatingButton() {
    setMenuStatus('');
    try {
      if (currentTabId === undefined) throw new Error('找不到目前分頁');
      const enabled = !floatingButtonEnabled;
      await setFloatingButtonEnabled(currentTabId, enabled);
      setFloatingEnabled(enabled);
      await sendToActiveTab({
        type: 'MANGA_TRANSLATOR_SET_FLOATING_BUTTON',
        enabled
      });
    } catch (error) {
      console.error(error);
      setMenuStatus(messages.pageUnavailable);
    }
  }

  async function handleOpenSidePanel() {
    setMenuStatus('');
    try {
      if (currentWindowId === undefined) {
        throw new Error('無法取得目前 Chrome 視窗');
      }
      await chrome.sidePanel.open({ windowId: currentWindowId });
      window.close();
    } catch (error) {
      console.error(error);
      setMenuStatus(messages.sidePanelError);
    }
  }

  async function handleOpenSettings() {
    try {
      setSettings(await getSettings());
      setSettingsStatus('');
      setView('settings');
    } catch (error) {
      setMenuStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSettingsStatus('');
    const apiKey = settings.openaiApiKey.trim();

    if (!apiKey) {
      setSettingsStatus(messages.enterApiKey);
      return;
    }

    await saveSettings({ ...settings, openaiApiKey: apiKey });
    setSettingsStatus(messages.settingsSaved);
  }

  async function handleClearApiKey() {
    await clearApiKey();
    setSettings((current) => ({ ...current, openaiApiKey: '' }));
    setSettingsStatus(messages.apiKeyCleared);
  }

  if (view === 'settings') {
    return (
      <main className="popup-shell">
        <div className="title-row">
          <h1>{messages.openAiSettings}</h1>
          <button
            className="icon-button"
            type="button"
            onClick={() => setView('menu')}
          >
            {messages.back}
          </button>
        </div>

        <form className="settings-form" onSubmit={handleSubmit}>
          <label htmlFor="api-key">{messages.apiKey}</label>
          <input
            id="api-key"
            type="password"
            value={settings.openaiApiKey}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck={false}
            autoFocus
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                openaiApiKey: event.target.value
              }))
            }
          />
          <p className="field-help">
            {messages.apiKeyHelp}
          </p>

          <label htmlFor="model">{messages.model}</label>
          <select
            id="model"
            value={settings.openaiModel}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                openaiModel: event.target.value as OpenAiModel
              }))
            }
          >
            {OPENAI_MODELS.map((model) => (
              <option key={model} value={model}>
                {MODEL_LABELS[model] || model}
              </option>
            ))}
          </select>

          <label htmlFor="ui-language">{messages.language}</label>
          <select
            id="ui-language"
            value={settings.uiLanguage}
            onChange={(event) => {
              const uiLanguage = event.target.value as UiLanguage;
              setSettings((current) => ({
                ...current,
                uiLanguage
              }));
              void chrome.storage.local.set({ uiLanguage });
            }}
          >
            {LANGUAGE_OPTIONS.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>

          <button className="primary-button" type="submit">
            {messages.saveSettings}
          </button>
          <button
            className="danger-button"
            type="button"
            onClick={handleClearApiKey}
          >
            {messages.clearApiKey}
          </button>
        </form>
        <p className="status" role="status">{settingsStatus}</p>
      </main>
    );
  }

  return (
    <main className="popup-shell">
      <div className="title-row">
        <h1>{messages.appTitle}</h1>
        <button
          className="icon-button"
          type="button"
          aria-label="開啟設定"
          onClick={handleOpenSettings}
        >
          {messages.settings}
        </button>
      </div>

      <div className="menu-actions">
        <button
          type="button"
          onClick={() =>
            sendToActiveTab({ type: 'MANGA_TRANSLATOR_START_SELECT' })
          }
        >
          <span className="menu-number">1</span>
          <span>{messages.startSelection}</span>
        </button>
        <button
          type="button"
          onClick={() =>
            sendToActiveTab({ type: 'MANGA_TRANSLATOR_CLEAR_RESULTS' })
          }
        >
          <span className="menu-number">2</span>
          <span>{messages.clearResults}</span>
        </button>
        <button type="button" onClick={handleToggleFloatingButton}>
          <span className="menu-number">3</span>
          <span>
            {floatingButtonEnabled
              ? messages.disableFloating
              : messages.enableFloating}
          </span>
        </button>
        <button
          type="button"
          disabled={currentWindowId === undefined}
          onClick={handleOpenSidePanel}
        >
          <span className="menu-number">4</span>
          <span>{messages.openSidePanel}</span>
        </button>
      </div>

      <p className="status" role="status">{menuStatus}</p>
      <p className="footer">© 2026 漫畫翻譯擴充功能</p>
    </main>
  );
}

function isMissingContentScriptError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  );
}
