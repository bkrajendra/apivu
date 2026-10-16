import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Folder,
  FolderOpen,
  Github,
  History,
  Layers,
  Maximize2,
  Moon,
  PanelRight,
  Rocket,
  Plus,
  Save,
  Send,
  Settings,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { JsonEditor, type ThemeConfig } from 'modern-json-react';
import 'modern-json-react/styles.css';
import { parseCurl } from '../../src/domain/parse-curl';
import { type ApiRequest, type HeaderPair, type SavedCollection } from '../../src/domain/request';
import { createCollectionId, exportCollections, loadCollections, saveCollections } from '../../src/storage/collections';
import { addHistoryEntry, loadHistory, saveHistory, type HistoryEntry } from '../../src/storage/history';
import './App.css';

const tabs = ['Params', 'Headers', 'Auth', 'Cookies', 'Body'] as const;
type RequestTab = (typeof tabs)[number];
type View = 'requests' | 'collections' | 'environments' | 'history' | 'settings';
type ThemePreference = 'system' | 'light' | 'dark';
type ResponseData = { status: number; statusText: string; elapsed: number; headers: HeaderPair[]; body: string; truncated: boolean };
const secretField = /auth|cookie|token|secret|password|passwd|credential|session|api[_-]?key/i;
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const navItems: { view: View; label: string; icon: ReactNode }[] = [
  { view: 'requests', label: 'Requests', icon: <FileCode2 size={17} strokeWidth={1.85} /> },
  { view: 'collections', label: 'Collections', icon: <Folder size={17} strokeWidth={1.85} /> },
  { view: 'environments', label: 'Environments', icon: <Layers size={17} strokeWidth={1.85} /> },
  { view: 'history', label: 'History', icon: <History size={17} strokeWidth={1.85} /> },
];

// The editor applies its theme as inline CSS variables, so brand colours are passed in rather than set in CSS.
const editorThemes: Record<'light' | 'dark', ThemeConfig> = {
  light: {
    name: 'apivu-light', bg: '#FFFFFF', fg: '#172033', border: '#E3E8EF', gutterBg: '#F8FAFC', gutterFg: '#8B98A9',
    selection: 'rgba(0, 122, 255, 0.16)', cursor: '#007AFF', keyColor: '#175CD3', stringColor: '#218345', numberColor: '#B45309',
    booleanColor: '#7651D6', nullColor: '#7651D6', bracketColor: '#64748B', bracketMatchBg: 'rgba(0, 122, 255, 0.14)',
    errorColor: '#D9363E', warningColor: '#B96B05', successColor: '#16834A', treeLine: '#E3E8EF', treeHover: '#F2F6FA',
    treeSelected: '#EAF3FF', typeBadgeBg: '#F2F6FA',
  },
  dark: {
    name: 'apivu-dark', bg: '#10161E', fg: '#F3F6FA', border: '#2A3442', gutterBg: '#10161E', gutterFg: '#748195',
    selection: 'rgba(10, 132, 255, 0.28)', cursor: '#0A84FF', keyColor: '#79B8FF', stringColor: '#7EE787', numberColor: '#F2CC60',
    booleanColor: '#D2A8FF', nullColor: '#D2A8FF', bracketColor: '#A3AFBF', bracketMatchBg: 'rgba(10, 132, 255, 0.24)',
    errorColor: '#FF6B72', warningColor: '#F5B94C', successColor: '#3CCB7F', treeLine: '#2A3442', treeHover: '#202B38',
    treeSelected: '#152B43', typeBadgeBg: '#1B2430',
  },
};

function displayUrl(value: string, reveal: boolean): string {
  if (reveal) return value;
  try {
    const url = new URL(value);
    const userInfo = Boolean(url.username || url.password);
    url.username = '';
    url.password = '';
    const query = Array.from(url.searchParams.entries());
    const masked = query.some(([key]) => secretField.test(key));
    if (!userInfo && !masked) return value;
    url.search = '';
    query.forEach(([key, item]) => url.searchParams.append(key, secretField.test(key) ? '***' : item));
    return url.toString();
  } catch {
    return value;
  }
}

function readBody(response: Response, limit = 1_000_000): Promise<{ text: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const reader = response.body?.getReader();
    if (!reader) return resolve({ text: '', truncated: false });
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;

    const next = async () => {
      try {
        const { done, value } = await reader.read();
        if (done) return resolve({ text: text + decoder.decode(), truncated: false });
        const remaining = limit - bytes;
        if (value.byteLength > remaining) {
          text += decoder.decode(value.subarray(0, remaining), { stream: true });
          text += decoder.decode();
          await reader.cancel();
          return resolve({ text, truncated: true });
        }
        bytes += value.byteLength;
        text += decoder.decode(value, { stream: true });
        void next();
      } catch (error) {
        reject(error);
      }
    };

    void next();
  });
}

function basicAuthorization(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `Basic ${btoa(binary)}`;
}

const isTabView = new URLSearchParams(window.location.search).get('view') === 'tab';

async function toggleViewMode() {
  if (isTabView) {
    const [{ id: windowId }, tab] = await Promise.all([browser.windows.getCurrent(), browser.tabs.getCurrent()]);
    await browser.sidePanel.open({ windowId: windowId! });
    if (tab?.id !== undefined) await browser.tabs.remove(tab.id);
  } else {
    await browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html?view=tab') });
    window.close();
  }
}

const MAX_JSON_EDITOR_BYTES = 200_000;

function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function isJsonDocument(text: string) {
  const trimmed = text.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0]!)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function formatBytes(text: string) {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(timestamp: number) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function methodClass(method: string) {
  return `method-badge method-${method.toLowerCase()}`;
}

function WarningsBadge({ warnings }: { warnings: string[] }) {
  const unique = [...new Set(warnings)];
  if (unique.length === 0) return null;
  return (
    <div className="warnings-badge">
      <button className="icon-button warnings-trigger" type="button" aria-label={`${unique.length} warning${unique.length === 1 ? '' : 's'}`} aria-describedby="warnings-popover">
        <AlertTriangle size={16} />
        <span className="warnings-count">{unique.length}</span>
      </button>
      <div className="warnings-popover" id="warnings-popover" role="tooltip">
        <p className="warnings-title">Warnings</p>
        <ul>{unique.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={value === option.value ? 'is-selected' : ''} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

function App() {
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme: 'light' | 'dark' = themePreference === 'system' ? (systemDark ? 'dark' : 'light') : themePreference;
  const [view, setView] = useState<View>('requests');
  const [rawCurl, setRawCurl] = useState('');
  const [showParser, setShowParser] = useState(true);
  const [request, setRequest] = useState<ApiRequest | null>(null);
  const [urlFocused, setUrlFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<RequestTab>('Params');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [keepHistory, setKeepHistory] = useState(true);
  const [collectionName, setCollectionName] = useState('My collection');
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [includeBrowserCookies, setIncludeBrowserCookies] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendWarnings, setSendWarnings] = useState<string[]>([]);
  const [responseData, setResponseData] = useState<ResponseData | null>(null);
  const [responseTab, setResponseTab] = useState<'Body' | 'Headers'>('Body');
  const [bodyEditorMode, setBodyEditorMode] = useState<'code' | 'tree' | 'split'>('code');
  const [responseEditorMode, setResponseEditorMode] = useState<'code' | 'tree' | 'split'>('code');
  const [bodyView, setBodyView] = useState<'json' | 'raw' | null>(null);
  const [responseMode, setResponseMode] = useState<'Pretty' | 'Raw'>('Pretty');
  const [notice, setNotice] = useState('');
  const version = useMemo(() => browser.runtime.getManifest().version, []);

  useEffect(() => {
    void loadCollections().then(setCollections).catch(() => setNotice('Local storage is unavailable.'));
    void loadHistory().then(setHistory).catch(() => undefined);
    void browser.storage.local.get(['uiTheme', 'keepHistory']).then(({ uiTheme, keepHistory: storedKeepHistory }) => {
      if (uiTheme === 'light' || uiTheme === 'dark' || uiTheme === 'system') setThemePreference(uiTheme);
      if (typeof storedKeepHistory === 'boolean') setKeepHistory(storedKeepHistory);
    }).catch(() => undefined);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const changeThemePreference = (next: ThemePreference) => {
    setThemePreference(next);
    void browser.storage.local.set({ uiTheme: next }).catch(() => undefined);
  };

  const changeKeepHistory = (next: boolean) => {
    setKeepHistory(next);
    void browser.storage.local.set({ keepHistory: next }).catch(() => undefined);
  };

  const queryPairs = useMemo(() => {
    if (!request?.url) return [];
    try {
      return Array.from(new URL(request.url).searchParams.entries());
    } catch {
      return [];
    }
  }, [request?.url]);
  const visibleUrl = useMemo(
    () => displayUrl(request?.url ?? '', showSecrets || urlFocused),
    [request?.url, showSecrets, urlFocused],
  );

  const updateRequest = (changes: Partial<ApiRequest>) => {
    setRequest((current) => current ? { ...current, ...changes, updatedAt: Date.now() } : current);
  };

  const handleParse = () => {
    const result = parseCurl(rawCurl);
    setParseErrors(result.errors);
    setParseWarnings(result.warnings);
    if (!result.request) return;
    setRequest(result.request);
    setBodyView(null);
    setResponseData(null);
    setSendError('');
    setSendWarnings([]);
    setShowParser(false);
  };

  const updateQueryPair = (index: number, key: string, value: string) => {
    if (!request) return;
    try {
      const nextUrl = new URL(request.url);
      const pairs = Array.from(nextUrl.searchParams.entries());
      pairs[index] = [key, value];
      nextUrl.search = '';
      pairs.forEach(([pairKey, pairValue]) => nextUrl.searchParams.append(pairKey, pairValue));
      updateRequest({ url: nextUrl.toString() });
    } catch {
      setSendError('Enter a valid URL before editing query parameters.');
    }
  };

  const addQueryPair = () => {
    if (!request) return;
    try {
      const nextUrl = new URL(request.url);
      nextUrl.searchParams.append('', '');
      updateRequest({ url: nextUrl.toString() });
    } catch {
      setSendError('Enter a valid URL before adding query parameters.');
    }
  };

  const removeQueryPair = (index: number) => {
    if (!request) return;
    try {
      const nextUrl = new URL(request.url);
      const pairs = Array.from(nextUrl.searchParams.entries()).filter((_, rowIndex) => rowIndex !== index);
      nextUrl.search = '';
      pairs.forEach(([pairKey, pairValue]) => nextUrl.searchParams.append(pairKey, pairValue));
      updateRequest({ url: nextUrl.toString() });
    } catch {
      setSendError('Enter a valid URL before editing query parameters.');
    }
  };

  const updatePair = (field: 'headers' | 'cookies', index: number, key: 'name' | 'value', value: string) => {
    if (!request) return;
    const rows = [...request[field]];
    const row = rows[index];
    if (!row) return;
    rows[index] = { ...row, [key]: value };
    updateRequest({ [field]: rows });
  };

  const addPair = (field: 'headers' | 'cookies') => {
    if (!request) return;
    updateRequest({ [field]: [...request[field], { name: '', value: '' }] });
  };

  const removePair = (field: 'headers' | 'cookies', index: number) => {
    if (!request) return;
    updateRequest({ [field]: request[field].filter((_, rowIndex) => rowIndex !== index) });
  };

  const recordHistory = (sent: ApiRequest, status: number | null, elapsed: number | null) => {
    if (!keepHistory) return;
    setHistory((current) => {
      const next = addHistoryEntry(current, { request: sent, status, elapsed, sentAt: Date.now() });
      void saveHistory(next).catch(() => undefined);
      return next;
    });
  };

  const handleSend = async () => {
    if (!request || sending) return;
    setSendError('');
    setSendWarnings([]);
    setResponseData(null);

    let target: URL;
    try {
      target = new URL(request.url);
      if (!['http:', 'https:'].includes(target.protocol)) throw new Error();
    } catch {
      setSendError('Enter a valid HTTP or HTTPS URL.');
      return;
    }

    let requestToSend = request;
    const preliminaryWarnings: string[] = [];
    if (target.username || target.password) {
      const decode = (value: string) => {
        try { return decodeURIComponent(value); } catch { return value; }
      };
      const hasExplicitAuth = request.auth.type !== 'none';
      const auth = hasExplicitAuth ? request.auth : {
        type: 'basic' as const,
        token: '',
        username: decode(target.username),
        password: decode(target.password),
      };
      if (hasExplicitAuth) preliminaryWarnings.push('Credentials embedded in the URL were removed; the configured auth was used.');
      target.username = '';
      target.password = '';
      requestToSend = { ...request, url: target.toString(), auth };
      updateRequest({ url: requestToSend.url, auth });
    }

    setSending(true);
    const permission = await browser.permissions.request({ origins: [`${target.protocol}//${target.hostname}/*`] }).catch(() => false);
    if (!permission) {
      setSendError(`Allow access to ${target.host} in Chrome to send this request.`);
      setSending(false);
      return;
    }

    const warnings = [...preliminaryWarnings];
    const headers = new Headers();
    const forbidden = new Set(['cookie', 'host', 'origin', 'content-length', 'connection', 'transfer-encoding', 'referer', 'accept-encoding', 'user-agent']);

    requestToSend.headers.forEach(({ name, value }) => {
      const normalized = name.toLowerCase();
      if (forbidden.has(normalized) || normalized.startsWith('sec-') || normalized.startsWith('proxy-')) {
        warnings.push(`${name} is controlled by the browser and was not sent.`);
      } else if (name.trim()) {
        try {
          headers.append(name, value);
        } catch {
          warnings.push(`${name} is not a valid request header and was skipped.`);
        }
      }
    });

    if (requestToSend.cookies.length) warnings.push('Pasted cookies are shown and saved, but Chrome Fetch cannot replay a manual Cookie header.');
    if (['GET', 'HEAD'].includes(requestToSend.method.toUpperCase()) && requestToSend.body) warnings.push(`${requestToSend.method.toUpperCase()} requests cannot send a body; it was omitted.`);
    try {
      if (requestToSend.auth.type === 'bearer' && requestToSend.auth.token) headers.set('Authorization', `Bearer ${requestToSend.auth.token}`);
      if (requestToSend.auth.type === 'basic' && (requestToSend.auth.username || requestToSend.auth.password)) {
        headers.set('Authorization', basicAuthorization(requestToSend.auth.username, requestToSend.auth.password));
      }
    } catch {
      setSendError('Authorization values contain characters that cannot be sent in an HTTP header.');
      setSendWarnings(warnings);
      setSending(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    const startedAt = performance.now();

    try {
      const response = await fetch(target, {
        method: requestToSend.method,
        headers,
        body: ['GET', 'HEAD'].includes(requestToSend.method.toUpperCase()) || !requestToSend.body ? undefined : requestToSend.body,
        credentials: includeBrowserCookies ? 'include' : 'omit',
        signal: controller.signal,
      });
      const body = await readBody(response);
      const elapsed = Math.round(performance.now() - startedAt);
      setResponseData({
        status: response.status,
        statusText: response.statusText,
        elapsed,
        headers: Array.from(response.headers.entries()).map(([name, value]) => ({ name, value })),
        body: body.text,
        truncated: body.truncated,
      });
      setResponseTab('Body');
      setSendWarnings(warnings);
      recordHistory(requestToSend, response.status, elapsed);
    } catch (error) {
      setSendError(error instanceof DOMException && error.name === 'AbortError'
        ? 'Request timed out after 30 seconds.'
        : 'Request failed. Check the URL, host permission, network, or browser policy.');
      setSendWarnings(warnings);
      recordHistory(requestToSend, null, null);
    } finally {
      window.clearTimeout(timeout);
      setSending(false);
    }
  };

  const handleSave = async () => {
    if (!request) return;
    const trimmedName = collectionName.trim() || 'My collection';
    const next = [...collections];
    let collection = next.find((item) => item.name.toLowerCase() === trimmedName.toLowerCase());
    if (!collection) {
      collection = { id: createCollectionId(), name: trimmedName, requests: [] };
      next.push(collection);
    }
    const savedRequest = { ...request, name: request.name.trim() || 'Untitled request', updatedAt: Date.now() };
    collection.requests = [savedRequest, ...collection.requests.filter((item) => item.id !== savedRequest.id)];
    setCollections(next);
    try {
      await saveCollections(next);
      setNotice('Request saved locally.');
    } catch {
      setNotice('Could not save. Local storage may be full.');
    }
  };

  const handleDelete = async (id: string) => {
    const next = collections
      .map((collection) => ({ ...collection, requests: collection.requests.filter((item) => item.id !== id) }))
      .filter((collection) => collection.requests.length > 0);
    setCollections(next);
    await saveCollections(next).catch(() => setNotice('Could not update local storage.'));
  };

  const handleClear = async () => {
    if (!window.confirm('Delete every saved collection from this device?')) return;
    setCollections([]);
    await saveCollections([]).then(() => setNotice('All saved collections were deleted.'))
      .catch(() => setNotice('Could not clear local storage.'));
  };

  const handleClearHistory = async () => {
    setHistory([]);
    await saveHistory([]).then(() => setNotice('Request history cleared.'))
      .catch(() => setNotice('Could not clear history.'));
  };

  const handleExport = () => {
    if (collections.length === 0) return;
    const blob = new Blob([exportCollections(collections, includeSecrets)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'apivu-collection.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(includeSecrets ? 'Exported with secrets.' : 'Exported with secrets redacted.');
  };

  const openRequest = (savedRequest: ApiRequest, parentName?: string) => {
    setRequest(savedRequest);
    setBodyView(null);
    if (parentName) setCollectionName(parentName);
    setRawCurl(savedRequest.sourceCurl);
    setParseErrors([]);
    setParseWarnings([]);
    setSendWarnings([]);
    setSendError('');
    setResponseData(null);
    setShowParser(false);
    setView('requests');
  };

  const startNew = () => {
    setShowParser(true);
    setParseErrors([]);
    setView('requests');
  };

  const effectiveBodyView = bodyView ?? (isJsonDocument(request?.body ?? '') ? 'json' : 'raw');
  // The editor owns its text while editing; this seed is only recomputed when a request loads or the JSON view is (re)entered,
  // so reformatting never fights the cursor.
  const bodySeed = useMemo(
    () => prettyJson(request?.body ?? ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [request?.id, effectiveBodyView],
  );
  const responseIsJson = useMemo(
    () => Boolean(responseData && !responseData.truncated && responseData.body.length <= MAX_JSON_EDITOR_BYTES && isJsonDocument(responseData.body)),
    [responseData],
  );

  const prettyBody = useMemo(() => {
    if (!responseData?.body) return '';
    try {
      return JSON.stringify(JSON.parse(responseData.body), null, 2);
    } catch {
      return responseData.body;
    }
  }, [responseData?.body]);

  const savedCount = collections.reduce((total, collection) => total + collection.requests.length, 0);
  const revealButton = (label: string) => (
    <button className="text-button" type="button" onClick={() => setShowSecrets((visible) => !visible)}>
      {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}{showSecrets ? `Hide ${label}` : `Reveal ${label}`}
    </button>
  );

  const renderRequests = () => (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Request builder</p>
          <h1>{showParser || !request ? 'Start with cURL' : 'Review request'}</h1>
        </div>
        {!showParser && request && <button className="button button-secondary" type="button" onClick={startNew}><Plus size={15} /> Create New</button>}
        {showParser && request && <button className="button button-ghost" type="button" onClick={() => setShowParser(false)}>Back to request</button>}
      </div>

      {(showParser || !request) && (
        <section className="card import-card">
          <label className="field-label" htmlFor="curl-input">Paste cURL</label>
          <textarea
            id="curl-input"
            className="input code-text curl-input"
            value={rawCurl}
            onChange={(event) => setRawCurl(event.target.value)}
            onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') handleParse(); }}
            placeholder={'curl \'https://api.example.com/v1/users?active=true\' \\\n  -H \'Authorization: Bearer your-token\' \\\n  -H \'Content-Type: application/json\' \\\n  -d \'{"name":"Ada"}\''}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <div className="import-footer">
            <span className="caption">Parsed on this device. Nothing is uploaded. <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> to create.</span>
            <div className="inline-actions">
              <WarningsBadge warnings={parseWarnings} />
              <button className="button button-primary" type="button" onClick={handleParse} disabled={!rawCurl.trim()}>Create request</button>
            </div>
          </div>
          {parseErrors.map((error) => <p className="inline-error" role="alert" key={error}><AlertTriangle size={14} />{error}</p>)}
        </section>
      )}

      {request && !showParser && (
        <>
          <div className="url-row">
            <div className="url-field">
              <select className={`method-select ${methodClass(request.method)}`} value={request.method} onChange={(event) => updateRequest({ method: event.target.value })} aria-label="HTTP method">
                {methods.map((method) => <option key={method}>{method}</option>)}
              </select>
              <input className="url-input" value={visibleUrl} onFocus={() => setUrlFocused(true)} onBlur={() => setUrlFocused(false)} onChange={(event) => updateRequest({ url: event.target.value })} aria-label="Request URL" placeholder="https://api.example.com/path" spellCheck={false} />
              <WarningsBadge warnings={[...parseWarnings, ...sendWarnings]} />
            </div>
            <button className="button button-primary button-lg send-button" type="button" onClick={() => void handleSend()} disabled={sending}>
              {sending ? <><span className="spinner" /> Sending</> : <><Send size={16} /> Send</>}
            </button>
          </div>
          <p className="caption url-caption">Chrome asks for access to this host only, the first time you send to it.</p>
          {sendError && <p className="inline-error" role="alert"><AlertTriangle size={14} />{sendError}</p>}

          <nav className="tab-list" aria-label="Request settings" role="tablist">
            {tabs.map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className="tab" onClick={() => setActiveTab(tab)}>
                {tab}
                {tab === 'Headers' && request.headers.length > 0 && <span className="count-badge">{request.headers.length}</span>}
                {tab === 'Params' && queryPairs.length > 0 && <span className="count-badge">{queryPairs.length}</span>}
                {tab === 'Cookies' && request.cookies.length > 0 && <span className="count-badge">{request.cookies.length}</span>}
              </button>
            ))}
          </nav>

          <div className="tab-panel" role="tabpanel" aria-label={activeTab}>
            {activeTab === 'Params' && (
              <>
                {queryPairs.length > 0 && <div className="pair-heading"><span>Key</span><span>Value</span><span /></div>}
                {queryPairs.map(([key, value], index) => (
                  <div className="pair-row" key={`${index}-${key}`}>
                    <input className="input" value={key} aria-label={`Parameter ${index + 1} key`} placeholder="key" onChange={(event) => updateQueryPair(index, event.target.value, value)} />
                    <input className="input" type={showSecrets || !secretField.test(key) ? 'text' : 'password'} value={value} aria-label={`Parameter ${index + 1} value`} placeholder="value" onChange={(event) => updateQueryPair(index, key, event.target.value)} />
                    <button className="icon-button" type="button" title="Remove parameter" aria-label={`Remove parameter ${index + 1}`} onClick={() => removeQueryPair(index)}><X size={15} /></button>
                  </div>
                ))}
                {queryPairs.length === 0 && <p className="empty-note">No query parameters.</p>}
                <div className="panel-actions">
                  <button className="text-button" type="button" onClick={addQueryPair}><Plus size={14} /> Add parameter</button>
                  {queryPairs.some(([key]) => secretField.test(key)) && revealButton('secret values')}
                </div>
              </>
            )}
            {activeTab === 'Headers' && (
              <>
                {request.headers.length > 0 && <div className="pair-heading"><span>Header</span><span>Value</span><span /></div>}
                {request.headers.map((header, index) => (
                  <div className="pair-row" key={index}>
                    <input className="input" value={header.name} aria-label={`Header ${index + 1} name`} placeholder="Header name" onChange={(event) => updatePair('headers', index, 'name', event.target.value)} />
                    <input className="input" value={header.value} aria-label={`Header ${index + 1} value`} placeholder="Value" onChange={(event) => updatePair('headers', index, 'value', event.target.value)} />
                    <button className="icon-button" type="button" title="Remove header" aria-label={`Remove header ${index + 1}`} onClick={() => removePair('headers', index)}><X size={15} /></button>
                  </div>
                ))}
                {request.headers.length === 0 && <p className="empty-note">No headers added.</p>}
                <div className="panel-actions"><button className="text-button" type="button" onClick={() => addPair('headers')}><Plus size={14} /> Add header</button></div>
              </>
            )}
            {activeTab === 'Auth' && (
              <div className="form-stack">
                <label className="field-label" htmlFor="auth-type">Auth type</label>
                <select id="auth-type" className="input select" value={request.auth.type} onChange={(event) => updateRequest({ auth: { ...request.auth, type: event.target.value as ApiRequest['auth']['type'] } })}>
                  <option value="none">No auth</option><option value="bearer">Bearer token</option><option value="basic">Basic auth</option>
                </select>
                {request.auth.type === 'bearer' && <label className="field-label" htmlFor="bearer-token">Token<input id="bearer-token" className="input" type={showSecrets ? 'text' : 'password'} autoComplete="off" value={request.auth.token} onChange={(event) => updateRequest({ auth: { ...request.auth, token: event.target.value } })} placeholder="Paste token" /></label>}
                {request.auth.type === 'basic' && <>
                  <label className="field-label" htmlFor="basic-user">Username<input id="basic-user" className="input" autoComplete="off" value={request.auth.username} onChange={(event) => updateRequest({ auth: { ...request.auth, username: event.target.value } })} placeholder="Username" /></label>
                  <label className="field-label" htmlFor="basic-password">Password<input id="basic-password" className="input" type={showSecrets ? 'text' : 'password'} autoComplete="new-password" value={request.auth.password} onChange={(event) => updateRequest({ auth: { ...request.auth, password: event.target.value } })} placeholder="Password" /></label>
                </>}
                {request.auth.type !== 'none' && <div>{revealButton('secrets')}</div>}
              </div>
            )}
            {activeTab === 'Cookies' && (
              <>
                <div className="callout callout-warning"><AlertTriangle size={15} /><p>Chrome blocks manually setting the Cookie header. Values are saved for reference, not replayed.</p></div>
                {request.cookies.length > 0 && <div className="pair-heading"><span>Cookie</span><span>Value</span><span /></div>}
                {request.cookies.map((cookie, index) => (
                  <div className="pair-row" key={index}>
                    <input className="input" value={cookie.name} aria-label={`Cookie ${index + 1} name`} placeholder="Name" onChange={(event) => updatePair('cookies', index, 'name', event.target.value)} />
                    <input className="input" value={cookie.value} type={showSecrets ? 'text' : 'password'} aria-label={`Cookie ${index + 1} value`} placeholder="Value" onChange={(event) => updatePair('cookies', index, 'value', event.target.value)} />
                    <button className="icon-button" type="button" title="Remove cookie" aria-label={`Remove cookie ${index + 1}`} onClick={() => removePair('cookies', index)}><X size={15} /></button>
                  </div>
                ))}
                {request.cookies.length === 0 && <p className="empty-note">No pasted cookies.</p>}
                <div className="panel-actions">
                  <button className="text-button" type="button" onClick={() => addPair('cookies')}><Plus size={14} /> Add cookie</button>
                  {request.cookies.length > 0 && revealButton('cookie values')}
                </div>
                <label className="check-row"><input type="checkbox" checked={includeBrowserCookies} onChange={(event) => setIncludeBrowserCookies(event.target.checked)} /><span>Include browser-managed cookies for this host</span></label>
              </>
            )}
            {activeTab === 'Body' && (
              <>
                <div className="body-heading">
                  <span className="field-label">Request body</span>
                  <SegmentedControl label="Body format" value={effectiveBodyView} options={[{ value: 'json', label: 'JSON' }, { value: 'raw', label: 'Raw' }]} onChange={setBodyView} />
                </div>
                {effectiveBodyView === 'json'
                  ? <JsonEditor className="json-field" value={bodySeed} theme={editorThemes[theme]} height={isTabView ? 420 : 300} mode={bodyEditorMode} onModeChange={setBodyEditorMode} indentation={2} onChange={(_value, rawText) => { setBodyView('json'); updateRequest({ body: rawText }); }} />
                  : <textarea className="input code-text body-input" value={request.body} onChange={(event) => updateRequest({ body: event.target.value })} placeholder="Request body" spellCheck={false} />}
              </>
            )}
          </div>

          <div className="save-row">
            <label className="field-label" htmlFor="request-name">Request name<input id="request-name" className="input" value={request.name} onChange={(event) => updateRequest({ name: event.target.value })} /></label>
            <label className="field-label" htmlFor="collection-name">Collection<input id="collection-name" className="input" list="collection-options" value={collectionName} onChange={(event) => setCollectionName(event.target.value)} /></label>
            <datalist id="collection-options">{collections.map((collection) => <option key={collection.id} value={collection.name} />)}</datalist>
            <button className="button button-secondary save-button" type="button" onClick={() => void handleSave()} title="Save request locally"><Save size={15} /> Save</button>
          </div>

          {responseData && (
            <section className="card response-card" aria-label="Response">
              <div className="response-meta">
                <span className="section-title">Response</span>
                <span className={`status-pill ${responseData.status < 300 ? 'is-success' : responseData.status < 400 ? 'is-info' : 'is-error'}`}>
                  {responseData.status < 400 ? <Check size={13} /> : <AlertTriangle size={13} />}{responseData.status} {responseData.statusText}
                </span>
                <span className="caption">{responseData.elapsed} ms</span>
                <span className="caption">{formatBytes(responseData.body)}{responseData.truncated ? ' (truncated)' : ''}</span>
              </div>
              <div className="response-toolbar">
                <nav className="tab-list tab-list-compact" role="tablist" aria-label="Response">
                  <button type="button" role="tab" className="tab" aria-selected={responseTab === 'Body'} onClick={() => setResponseTab('Body')}>Body</button>
                  <button type="button" role="tab" className="tab" aria-selected={responseTab === 'Headers'} onClick={() => setResponseTab('Headers')}>Headers<span className="count-badge">{responseData.headers.length}</span></button>
                </nav>
                {responseTab === 'Body' && <SegmentedControl label="Response format" value={responseMode} options={[{ value: 'Pretty', label: 'Pretty' }, { value: 'Raw', label: 'Raw' }]} onChange={setResponseMode} />}
              </div>
              {responseTab === 'Body' && (responseMode === 'Pretty' && responseIsJson
                ? <JsonEditor className="json-field" value={prettyBody} theme={editorThemes[theme]} height={isTabView ? 460 : 340} mode={responseEditorMode} onModeChange={setResponseEditorMode} indentation={2} readOnly />
                : <pre className="response-body code-text">{responseData.truncated ? `${responseMode === 'Pretty' ? prettyBody : responseData.body}\n\n[Response truncated at 1 MB]` : (responseMode === 'Pretty' ? prettyBody : responseData.body) || 'Empty response body'}</pre>)}
              {responseTab === 'Headers' && (
                <div className="response-headers">
                  {responseData.headers.length === 0 && <p className="empty-note">No response headers.</p>}
                  {responseData.headers.map((header) => <div className="response-header" key={header.name}><span>{header.name}</span><code>{header.value}</code></div>)}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );

  const renderCollections = () => (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Collections</h1>
        </div>
        <button className="button button-secondary" type="button" onClick={handleExport} disabled={collections.length === 0}><Download size={15} /> Export JSON</button>
      </div>
      {collections.length === 0 ? (
        <EmptyState icon={<Folder size={20} />} title="No saved requests yet">Build a request, give it a name and collection, then press Save. It stays on this device.</EmptyState>
      ) : (
        <>
          {collections.map((collection) => (
            <section className="card list-card" key={collection.id} aria-label={collection.name}>
              <header className="list-card-header"><FolderOpen size={16} /><h2>{collection.name}</h2><span className="count-badge">{collection.requests.length}</span></header>
              <ul className="list">
                {collection.requests.map((savedRequest) => (
                  <li className="list-row" key={savedRequest.id}>
                    <button className="list-main" type="button" onClick={() => openRequest(savedRequest, collection.name)}>
                      <span className={methodClass(savedRequest.method)}>{savedRequest.method}</span>
                      <span className="list-text"><span className="list-title">{savedRequest.name}</span><span className="list-sub">{displayUrl(savedRequest.url, false)}</span></span>
                    </button>
                    <button className="icon-button icon-danger" type="button" title={`Delete ${savedRequest.name}`} aria-label={`Delete ${savedRequest.name}`} onClick={() => void handleDelete(savedRequest.id)}><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <label className="check-row"><input type="checkbox" checked={includeSecrets} onChange={(event) => setIncludeSecrets(event.target.checked)} /><span>Include secrets in export. Request bodies are always included and may contain secrets.</span></label>
        </>
      )}
    </>
  );

  const renderHistory = () => (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>History</h1>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void handleClearHistory()} disabled={history.length === 0}><Trash2 size={15} /> Clear history</button>
      </div>
      {!keepHistory && <div className="callout callout-info"><History size={15} /><p>History is turned off. Turn it on in Settings to record sent requests.</p></div>}
      {history.length === 0 ? (
        <EmptyState icon={<History size={20} />} title="No requests sent yet">Requests you send appear here, newest first. The last 50 are kept on this device.</EmptyState>
      ) : (
        <section className="card list-card">
          <ul className="list">
            {history.map((entry) => (
              <li className="list-row" key={entry.id}>
                <button className="list-main" type="button" onClick={() => openRequest(entry.request)}>
                  <span className={methodClass(entry.request.method)}>{entry.request.method}</span>
                  <span className="list-text"><span className="list-title">{displayUrl(entry.request.url, false)}</span><span className="list-sub">{formatTime(entry.sentAt)}{entry.elapsed !== null ? ` · ${entry.elapsed} ms` : ''}</span></span>
                </button>
                <span className={`status-pill ${entry.status === null || entry.status >= 400 ? 'is-error' : entry.status >= 300 ? 'is-info' : 'is-success'}`}>{entry.status ?? 'Failed'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  const renderEnvironments = () => (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Environments</h1>
        </div>
      </div>
      <EmptyState icon={<Layers size={20} />} title="Environments are coming soon">Environment variables such as base URLs and tokens, swapped per environment, are planned for a future version.</EmptyState>
    </>
  );

  const renderSettings = () => (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Settings</h1>
        </div>
      </div>
      <section className="card settings-card">
        <div className="setting-row">
          <div><h2>Appearance</h2><p className="caption">System follows your operating system.</p></div>
          <SegmentedControl label="Theme" value={themePreference} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} onChange={changeThemePreference} />
        </div>
        <div className="setting-row">
          <div><h2>Request history</h2><p className="caption">Keep the last 50 sent requests on this device.</p></div>
          <label className="switch"><input type="checkbox" role="switch" checked={keepHistory} onChange={(event) => changeKeepHistory(event.target.checked)} /><span className="switch-track" aria-hidden="true" /><span className="sr-only">Keep request history</span></label>
        </div>
        <div className="setting-row">
          <div><h2>Export secrets</h2><p className="caption">Include auth, cookies and secret parameters in exported JSON.</p></div>
          <label className="switch"><input type="checkbox" role="switch" checked={includeSecrets} onChange={(event) => setIncludeSecrets(event.target.checked)} /><span className="switch-track" aria-hidden="true" /><span className="sr-only">Include secrets in export</span></label>
        </div>
        <div className="setting-row">
          <div><h2>Local data</h2><p className="caption">{savedCount} saved request{savedCount === 1 ? '' : 's'} · {history.length} history entr{history.length === 1 ? 'y' : 'ies'}. Saved data stays on this device and isn’t encrypted by apiVU.</p></div>
          <div className="inline-actions">
            <button className="button button-secondary" type="button" onClick={() => void handleClearHistory()} disabled={history.length === 0}>Clear history</button>
            <button className="button button-danger" type="button" onClick={() => void handleClear()} disabled={collections.length === 0}><Trash2 size={15} /> Clear collections</button>
          </div>
        </div>
      </section>
    </>
  );

  return (
    <div className={`app-shell ${isTabView ? 'is-tab' : ''}`} data-theme={theme}>
      <header className="app-header">
        <div className="brand-lockup">
          <img className="brand-mark" src="/icons/128.png" alt="" width={30} height={30} />
          <div>
            <p className="brand-name">apiVU</p>
            <p className="brand-caption">LOCAL API WORKSPACE</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-button" type="button" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => changeThemePreference(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button className="icon-button" type="button" title={isTabView ? 'Back to side panel' : 'Open in full window'} aria-label={isTabView ? 'Back to side panel' : 'Open in full window'} onClick={() => void toggleViewMode()}>
            {isTabView ? <PanelRight size={17} /> : <Maximize2 size={17} />}
          </button>
          <button className={`icon-button ${view === 'collections' ? 'is-active' : ''}`} type="button" title="Collections" aria-label="Collections" onClick={() => setView('collections')}>
            <FolderOpen size={17} />
          </button>
          <button className="icon-button" type="button" title="Export collections" aria-label="Export collections" onClick={handleExport} disabled={collections.length === 0}>
            <Download size={17} />
          </button>
        </div>
      </header>

      <div className="app-body">
        <nav className="sidebar" aria-label="Workspace">
          <ul className="nav-list">
            {navItems.map((item) => (
              <li key={item.view}>
                <button type="button" className="nav-item" aria-current={view === item.view ? 'page' : undefined} title={item.label} onClick={() => setView(item.view)}>
                  {item.icon}<span className="nav-label">{item.label}</span>
                  {item.view === 'collections' && savedCount > 0 && <span className="nav-count">{savedCount}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="nav-divider" />
          <ul className="nav-list">
            <li>
              <button type="button" className="nav-item" aria-current={view === 'settings' ? 'page' : undefined} title="Settings" onClick={() => setView('settings')}>
                <Settings size={17} strokeWidth={1.85} /><span className="nav-label">Settings</span>
              </button>
            </li>
          </ul>
        </nav>

        <main className="workspace">
          <div className="workspace-inner">
            {view === 'requests' && renderRequests()}
            {view === 'collections' && renderCollections()}
            {view === 'history' && renderHistory()}
            {view === 'environments' && renderEnvironments()}
            {view === 'settings' && renderSettings()}
          </div>
        </main>
      </div>

      <footer className="status-bar">
        <span className="status-left"><span className="status-dot" aria-hidden="true" />apiVU {version}<span className="status-extra"> · Local only, nothing is uploaded</span></span>
        <span className="status-right">
          <span className="credit">Compiled with conviction <Rocket className="credit-icon" size={13} aria-label="rocket" /> by <a href="https://rajendrakhope.com" target="_blank" rel="noreferrer">Rajendra</a></span>
          <a className="status-link" href="https://github.com/bkrajendra/apivu" target="_blank" rel="noreferrer" title="apiVU on GitHub"><Github size={13} aria-hidden="true" /><span>GitHub</span></a>
        </span>
      </footer>

      {notice && <div className="toast" role="status"><Check size={15} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={14} /></button></div>}
    </div>
  );
}

export default App;
