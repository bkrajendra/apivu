import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Braces,
  Check,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Moon,
  Plus,
  Save,
  Send,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { parseCurl } from '../../src/domain/parse-curl';
import { type ApiRequest, type HeaderPair, type SavedCollection } from '../../src/domain/request';
import { createCollectionId, exportCollections, loadCollections, saveCollections } from '../../src/storage/collections';
import './App.css';

const tabs = ['Params', 'Headers', 'Auth', 'Cookies', 'Body'] as const;
type RequestTab = (typeof tabs)[number];
type ResponseData = { status: number; statusText: string; elapsed: number; headers: HeaderPair[]; body: string; truncated: boolean };
const secretField = /auth|cookie|token|secret|password|passwd|credential|session|api[_-]?key/i;

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

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const [rawCurl, setRawCurl] = useState('');
  const [showParser, setShowParser] = useState(true);
  const [request, setRequest] = useState<ApiRequest | null>(null);
  const [urlFocused, setUrlFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<RequestTab>('Params');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [collectionName, setCollectionName] = useState('My collection');
  const [savedOpen, setSavedOpen] = useState(false);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [includeBrowserCookies, setIncludeBrowserCookies] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendWarnings, setSendWarnings] = useState<string[]>([]);
  const [responseData, setResponseData] = useState<ResponseData | null>(null);
  const [responseMode, setResponseMode] = useState<'Pretty' | 'Raw'>('Pretty');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void loadCollections().then(setCollections).catch(() => setNotice('Local storage is unavailable.'));
    void browser.storage.local.get('uiTheme').then(({ uiTheme }) => {
      if (uiTheme === 'light' || uiTheme === 'dark') setTheme(uiTheme);
    }).catch(() => undefined);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    void browser.storage.local.set({ uiTheme: nextTheme }).catch(() => undefined);
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
    setResponseData(null);
    setSendError('');
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
      setResponseData({
        status: response.status,
        statusText: response.statusText,
        elapsed: Math.round(performance.now() - startedAt),
        headers: Array.from(response.headers.entries()).map(([name, value]) => ({ name, value })),
        body: body.text,
        truncated: body.truncated,
      });
      setSendWarnings(warnings);
    } catch (error) {
      setSendError(error instanceof DOMException && error.name === 'AbortError'
        ? 'Request timed out after 30 seconds.'
        : 'Request failed. Check the URL, host permission, network, or browser policy.');
      setSendWarnings(warnings);
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

  const handleExport = () => {
    const blob = new Blob([exportCollections(collections, includeSecrets)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'apivu-collection.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(includeSecrets ? 'Exported with secrets.' : 'Exported with secrets redacted.');
  };

  const loadSaved = (savedRequest: ApiRequest, parentName: string) => {
    setRequest(savedRequest);
    setCollectionName(parentName);
    setRawCurl(savedRequest.sourceCurl);
    setResponseData(null);
    setShowParser(false);
    setSavedOpen(false);
  };

  const prettyBody = useMemo(() => {
    if (!responseData?.body) return '';
    try {
      return JSON.stringify(JSON.parse(responseData.body), null, 2);
    } catch {
      return responseData.body;
    }
  }, [responseData?.body]);

  return (
    <main className="app-shell" data-theme={theme}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><Braces size={17} strokeWidth={2.3} /></span>
          <div>
            <p className="brand-name">apiVU</p>
            <p className="brand-caption">LOCAL API WORKSPACE</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className={`theme-switch ${theme}`}
            type="button"
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={toggleTheme}
          >
            <Sun className="theme-icon sun-icon" size={14} />
            <span className="theme-thumb" />
            <Moon className="theme-icon moon-icon" size={13} />
          </button>
          <button className={`icon-button ${savedOpen ? 'is-active' : ''}`} type="button" title="Saved requests" aria-label="Saved requests" onClick={() => setSavedOpen((open) => !open)}>
            <FolderOpen size={17} />
          </button>
          <button className="icon-button" type="button" title="Export collection" aria-label="Export collection" onClick={handleExport} disabled={collections.length === 0}>
            <Download size={17} />
          </button>
        </div>
      </header>

      {savedOpen && (
        <section className="saved-panel" aria-label="Saved requests">
          <div className="section-heading">
            <div><p className="eyebrow">YOUR WORKSPACE</p><h2>Saved requests</h2></div>
            <button className="icon-button" type="button" aria-label="Close saved requests" onClick={() => setSavedOpen(false)}><X size={16} /></button>
          </div>
          {collections.length === 0 ? <p className="empty-note">Saved requests will appear here.</p> : collections.map((collection) => (
            <div className="saved-collection" key={collection.id}>
              <p className="collection-label">{collection.name}</p>
              {collection.requests.map((savedRequest) => (
                <div className="saved-row" key={savedRequest.id}>
                  <button className="saved-request" type="button" onClick={() => loadSaved(savedRequest, collection.name)}>
                    <span className={`method-pill method-${savedRequest.method.toLowerCase()}`}>{savedRequest.method}</span>
                    <span className="saved-request-name">{savedRequest.name}</span>
                  </button>
                  <button className="icon-button danger-button" type="button" title={`Delete ${savedRequest.name}`} aria-label={`Delete ${savedRequest.name}`} onClick={() => void handleDelete(savedRequest.id)}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          ))}
          <div className="export-controls">
            <label className="check-row export-secret"><input type="checkbox" checked={includeSecrets} onChange={(event) => setIncludeSecrets(event.target.checked)} /><span>Include secrets in export</span></label>
            <p>Request bodies are included and may contain secrets.</p>
            <button className="secondary-button export-button" type="button" onClick={handleExport} disabled={collections.length === 0}><Download size={14} /> Export JSON</button>
            <button className="secondary-button clear-button" type="button" onClick={() => void handleClear()} disabled={collections.length === 0}><Trash2 size={14} /> Clear local data</button>
          </div>
        </section>
      )}

      <section className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">REQUEST BUILDER</p>
            <h1>{showParser ? 'Start with cURL' : 'Review request'}</h1>
          </div>
          {!showParser && <button className="secondary-button create-new-button" type="button" onClick={() => setShowParser(true)}><Plus size={14} /> Create New</button>}
        </div>

        {showParser && (
          <section className="import-surface">
            <label className="field-label" htmlFor="curl-input">Paste cURL</label>
            <textarea
              id="curl-input"
              className="curl-input code-input"
              value={rawCurl}
              onChange={(event) => setRawCurl(event.target.value)}
              onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') handleParse(); }}
              placeholder={'curl \'https://api.example.com/v1/users?active=true\' \\\n+  -H \'Authorization: Bearer your-token\' \\\n+  -H \'Content-Type: application/json\' \\\n+  -d \'{"name":"Ada"}\''}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <div className="import-footer">
              <span className="privacy-note">Parsed on this device. Nothing is uploaded.</span>
              <button className="primary-button" type="button" onClick={handleParse} disabled={!rawCurl.trim()}>
                Create
              </button>
            </div>
            {parseErrors.map((error) => <p className="inline-error" key={error}><AlertTriangle size={14} />{error}</p>)}
            {parseWarnings.map((warning) => <p className="inline-warning" key={warning}><AlertTriangle size={14} />{warning}</p>)}
          </section>
        )}

        {request && !showParser && (
          <>
            <section className="request-bar" aria-label="Request method and URL">
              <select className="method-select" value={request.method} onChange={(event) => updateRequest({ method: event.target.value })} aria-label="HTTP method">
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => <option key={method}>{method}</option>)}
              </select>
              <input className="url-input" value={visibleUrl} onFocus={() => setUrlFocused(true)} onBlur={() => setUrlFocused(false)} onChange={(event) => updateRequest({ url: event.target.value })} aria-label="Request URL" placeholder="https://api.example.com/path" />
            </section>
            {parseWarnings.map((warning) => <p className="inline-warning" key={warning}><AlertTriangle size={14} />{warning}</p>)}

            <section className="request-details">
              <nav className="request-tabs" aria-label="Request settings" role="tablist">
                {tabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={`request-tab ${activeTab === tab ? 'selected' : ''}`} onClick={() => setActiveTab(tab)}>{tab}{tab === 'Headers' && request.headers.length > 0 ? <span className="tab-count">{request.headers.length}</span> : null}</button>)}
              </nav>
              <div className="tab-content">
                {activeTab === 'Params' && (
                  <>
                    <div className="table-heading"><span>KEY</span><span>VALUE</span><span /></div>
                    {queryPairs.map(([key, value], index) => <div className="pair-row" key={`${index}-${key}`}>
                      <input value={key} aria-label={`Parameter ${index + 1} key`} placeholder="key" onChange={(event) => updateQueryPair(index, event.target.value, value)} />
                      <input type={showSecrets || !secretField.test(key) ? 'text' : 'password'} value={value} aria-label={`Parameter ${index + 1} value`} placeholder="value" onChange={(event) => updateQueryPair(index, key, event.target.value)} />
                      <button className="icon-button row-remove" type="button" aria-label={`Remove parameter ${index + 1}`} onClick={() => {
                        if (!request) return;
                        const nextUrl = new URL(request.url);
                        const pairs = Array.from(nextUrl.searchParams.entries()).filter((_, rowIndex) => rowIndex !== index);
                        nextUrl.search = '';
                        pairs.forEach(([pairKey, pairValue]) => nextUrl.searchParams.append(pairKey, pairValue));
                        updateRequest({ url: nextUrl.toString() });
                      }}><X size={14} /></button>
                    </div>)}
                    {queryPairs.length === 0 && <p className="empty-note">No query parameters</p>}
                    {queryPairs.some(([key]) => secretField.test(key)) && <button className="text-button reveal-button" type="button" onClick={() => setShowSecrets((visible) => !visible)}>{showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}{showSecrets ? ' Hide secret values' : ' Reveal secret values'}</button>}
                    <button className="add-row" type="button" onClick={addQueryPair}><Plus size={14} /> Add parameter</button>
                  </>
                )}
                {activeTab === 'Headers' && (
                  <>
                    <div className="table-heading"><span>HEADER</span><span>VALUE</span><span /></div>
                    {request.headers.map((header, index) => <div className="pair-row" key={index}>
                      <input value={header.name} aria-label={`Header ${index + 1} name`} placeholder="Header name" onChange={(event) => updatePair('headers', index, 'name', event.target.value)} />
                      <input value={header.value} aria-label={`Header ${index + 1} value`} placeholder="Value" onChange={(event) => updatePair('headers', index, 'value', event.target.value)} />
                      <button className="icon-button row-remove" type="button" aria-label={`Remove header ${index + 1}`} onClick={() => removePair('headers', index)}><X size={14} /></button>
                    </div>)}
                    {request.headers.length === 0 && <p className="empty-note">No headers added</p>}
                    <button className="add-row" type="button" onClick={() => addPair('headers')}><Plus size={14} /> Add header</button>
                  </>
                )}
                {activeTab === 'Auth' && (
                  <div className="auth-form">
                    <label className="field-label" htmlFor="auth-type">AUTH TYPE</label>
                    <select id="auth-type" className="select-input" value={request.auth.type} onChange={(event) => updateRequest({ auth: { ...request.auth, type: event.target.value as ApiRequest['auth']['type'] } })}>
                      <option value="none">No auth</option><option value="bearer">Bearer token</option><option value="basic">Basic auth</option>
                    </select>
                    {request.auth.type === 'bearer' && <label className="field-label" htmlFor="bearer-token">TOKEN<input id="bearer-token" type={showSecrets ? 'text' : 'password'} autoComplete="off" value={request.auth.token} onChange={(event) => updateRequest({ auth: { ...request.auth, token: event.target.value } })} placeholder="Paste token" /></label>}
                    {request.auth.type === 'basic' && <>
                      <label className="field-label" htmlFor="basic-user">USERNAME<input id="basic-user" autoComplete="off" value={request.auth.username} onChange={(event) => updateRequest({ auth: { ...request.auth, username: event.target.value } })} placeholder="Username" /></label>
                      <label className="field-label" htmlFor="basic-password">PASSWORD<input id="basic-password" type={showSecrets ? 'text' : 'password'} autoComplete="new-password" value={request.auth.password} onChange={(event) => updateRequest({ auth: { ...request.auth, password: event.target.value } })} placeholder="Password" /></label>
                    </>}
                    <button className="text-button reveal-button" type="button" onClick={() => setShowSecrets((visible) => !visible)}>{showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}{showSecrets ? ' Hide secrets' : ' Reveal secrets'}</button>
                  </div>
                )}
                {activeTab === 'Cookies' && (
                  <>
                    <div className="cookie-note"><AlertTriangle size={15} /><p>Chrome blocks manually setting the Cookie header. Values are saved for reference, not replayed.</p></div>
                    <button className="text-button reveal-button" type="button" onClick={() => setShowSecrets((visible) => !visible)}>{showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}{showSecrets ? ' Hide cookie values' : ' Reveal cookie values'}</button>
                    <div className="table-heading"><span>COOKIE</span><span>VALUE</span><span /></div>
                    {request.cookies.map((cookie, index) => <div className="pair-row" key={index}>
                      <input value={cookie.name} aria-label={`Cookie ${index + 1} name`} placeholder="Name" onChange={(event) => updatePair('cookies', index, 'name', event.target.value)} />
                      <input value={cookie.value} type={showSecrets ? 'text' : 'password'} aria-label={`Cookie ${index + 1} value`} placeholder="Value" onChange={(event) => updatePair('cookies', index, 'value', event.target.value)} />
                      <button className="icon-button row-remove" type="button" aria-label={`Remove cookie ${index + 1}`} onClick={() => removePair('cookies', index)}><X size={14} /></button>
                    </div>)}
                    {request.cookies.length === 0 && <p className="empty-note">No pasted cookies</p>}
                    <button className="add-row" type="button" onClick={() => addPair('cookies')}><Plus size={14} /> Add cookie</button>
                    <label className="check-row"><input type="checkbox" checked={includeBrowserCookies} onChange={(event) => setIncludeBrowserCookies(event.target.checked)} /><span>Include browser-managed cookies for this host</span></label>
                  </>
                )}
                {activeTab === 'Body' && <>
                  <div className="body-heading"><span className="field-label">REQUEST BODY</span><span className="body-format">Raw</span></div>
                  <textarea className="body-input code-input" value={request.body} onChange={(event) => updateRequest({ body: event.target.value })} placeholder="Request body" spellCheck={false} />
                </>}
              </div>
            </section>

            <section className="save-row">
              <label className="field-label request-name-label" htmlFor="request-name">REQUEST NAME<input id="request-name" value={request.name} onChange={(event) => updateRequest({ name: event.target.value })} /></label>
              <label className="field-label collection-name-label" htmlFor="collection-name">COLLECTION<input id="collection-name" value={collectionName} onChange={(event) => setCollectionName(event.target.value)} /></label>
              <button className="secondary-button save-button" type="button" onClick={() => void handleSave()} title="Save request locally"><Save size={15} /><span>Save</span></button>
            </section>

            <div className="send-row">
              <span className="permission-caption">Permission requested for this host only</span>
              <button className="primary-button send-button" type="button" onClick={() => void handleSend()} disabled={sending}>
                {sending ? <><span className="spinner" /> Sending</> : <><Send size={15} /> Send</>}
              </button>
            </div>

            {sendError && <p className="inline-error"><AlertTriangle size={14} />{sendError}</p>}
            {sendWarnings.map((warning) => <p className="inline-warning" key={warning}><AlertTriangle size={14} />{warning}</p>)}

            {responseData && (
              <section className="response-section">
                <div className="response-heading">
                  <div className="response-title"><p className="eyebrow">RESPONSE</p><span className={`status-code ${responseData.status < 400 ? 'status-good' : 'status-bad'}`}>{responseData.status} {responseData.statusText}</span></div>
                  <span className="response-time">{responseData.elapsed} ms</span>
                </div>
                <div className="response-tabs"><span>Body</span><span>{responseData.headers.length} headers</span><div className="response-mode"><button type="button" className={responseMode === 'Pretty' ? 'active' : ''} onClick={() => setResponseMode('Pretty')}>Pretty</button><button type="button" className={responseMode === 'Raw' ? 'active' : ''} onClick={() => setResponseMode('Raw')}>Raw</button></div></div>
                <pre className="response-body">{responseData.truncated ? `${responseMode === 'Pretty' ? prettyBody : responseData.body}\n\n[Response truncated at 1 MB]` : responseMode === 'Pretty' ? prettyBody : responseData.body || 'Empty response body'}</pre>
                {responseData.headers.length > 0 && <details className="response-headers"><summary>Response headers</summary>{responseData.headers.map((header) => <div className="response-header" key={header.name}><span>{header.name}</span><code>{header.value}</code></div>)}</details>}
              </section>
            )}
          </>
        )}
      </section>

      {notice && <div className="toast" role="status"><Check size={14} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={13} /></button></div>}

      <footer className="app-footer"><span>Made with ❤️ by <a href="https://rajendrakhope.com" target="_blank" rel="noreferrer">Rajendra</a></span><span>Apivu 0.1</span></footer>
    </main>
  );
}

export default App;