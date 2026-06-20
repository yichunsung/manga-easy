import { FormEvent, useEffect, useState } from 'react';
import {
  clearApiKey,
  DEFAULT_SETTINGS,
  getFloatingButtonEnabled,
  getSettings,
  saveSettings,
  setFloatingButtonEnabled
} from '../shared/storage';
import {
  OPENAI_MODELS,
  type ExtensionSettings,
  type MangaTranslatorMessage,
  type OpenAiModel
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
  const [currentWindowId, setCurrentWindowId] = useState<number>();
  const [menuStatus, setMenuStatus] = useState('');
  const [settingsStatus, setSettingsStatus] = useState('');

  useEffect(() => {
    void Promise.all([
      getFloatingButtonEnabled().then(setFloatingEnabled),
      chrome.windows.getCurrent().then((window) => {
        setCurrentWindowId(window.id);
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
      await chrome.tabs.sendMessage(tab.id, message);
      window.close();
    } catch (error) {
      console.error(error);
      setMenuStatus('此頁面無法使用，請重新整理一般網頁後再試。');
    }
  }

  async function handleToggleFloatingButton() {
    setMenuStatus('');
    try {
      const enabled = !floatingButtonEnabled;
      await setFloatingButtonEnabled(enabled);
      setFloatingEnabled(enabled);
      await sendToActiveTab({
        type: 'MANGA_TRANSLATOR_SET_FLOATING_BUTTON',
        enabled
      });
    } catch (error) {
      console.error(error);
      setMenuStatus('無法切換常駐按鈕，請重新整理一般網頁後再試。');
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
      setMenuStatus('無法開啟側邊欄，請確認 Chrome 已更新至支援版本。');
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
      setSettingsStatus('請輸入 OpenAI API Key。');
      return;
    }

    await saveSettings({ ...settings, openaiApiKey: apiKey });
    setSettingsStatus('設定已儲存。');
  }

  async function handleClearApiKey() {
    await clearApiKey();
    setSettings((current) => ({ ...current, openaiApiKey: '' }));
    setSettingsStatus('API Key 已清除。');
  }

  if (view === 'settings') {
    return (
      <main className="popup-shell">
        <div className="title-row">
          <h1>OpenAI 設定</h1>
          <button
            className="icon-button"
            type="button"
            onClick={() => setView('menu')}
          >
            返回
          </button>
        </div>

        <form className="settings-form" onSubmit={handleSubmit}>
          <label htmlFor="api-key">API Key</label>
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
            儲存在這台瀏覽器的 chrome.storage.local，內容不會加密。
          </p>

          <label htmlFor="model">模型</label>
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

          <button className="primary-button" type="submit">
            儲存設定
          </button>
          <button
            className="danger-button"
            type="button"
            onClick={handleClearApiKey}
          >
            清除 API Key
          </button>
        </form>
        <p className="status" role="status">{settingsStatus}</p>
      </main>
    );
  }

  return (
    <main className="popup-shell">
      <div className="title-row">
        <h1>漫畫翻譯</h1>
        <button
          className="icon-button"
          type="button"
          aria-label="開啟設定"
          onClick={handleOpenSettings}
        >
          設定
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
          <span>框選翻譯</span>
        </button>
        <button
          type="button"
          onClick={() =>
            sendToActiveTab({ type: 'MANGA_TRANSLATOR_CLEAR_RESULTS' })
          }
        >
          <span className="menu-number">2</span>
          <span>一鍵清除所有翻譯結果</span>
        </button>
        <button type="button" onClick={handleToggleFloatingButton}>
          <span className="menu-number">3</span>
          <span>
            {floatingButtonEnabled
              ? '關閉常駐框選按鈕'
              : '啟用常駐框選按鈕'}
          </span>
        </button>
        <button
          type="button"
          disabled={currentWindowId === undefined}
          onClick={handleOpenSidePanel}
        >
          <span className="menu-number">4</span>
          <span>展開側邊欄</span>
        </button>
      </div>

      <p className="status" role="status">{menuStatus}</p>
      <p className="footer">© 2026 漫畫翻譯擴充功能</p>
    </main>
  );
}
