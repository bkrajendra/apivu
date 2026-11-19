import { createEnvironment, type EnvVariable, type Environment } from './environment';
import { toStoredResponse, type StoredResponse } from './response';
import { createRequest, type ApiRequest, type AuthConfig, type HeaderPair, type SavedCollection } from './request';

export type PostmanImport = { collection: SavedCollection; skipped: string[]; variables: EnvVariable[] };

type Obj = Record<string, unknown>;
type Inherited = AuthConfig | undefined;

const SCHEMA_PATTERN = /\/collection\/v2\.[01]\b/;
const NOT_POSTMAN = 'Not a Postman collection (v2.0 or v2.1 JSON expected).';

const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const list = (value: unknown): Obj[] => (Array.isArray(value) ? value.filter(isObj) : []);

function buildUrl(url: unknown): string {
  if (typeof url === 'string') return url;
  if (!isObj(url)) return '';
  if (str(url.raw)) return str(url.raw);
  const host = Array.isArray(url.host) ? url.host.join('.') : str(url.host);
  if (!host) return '';
  const path = Array.isArray(url.path) ? url.path.map(str).join('/') : str(url.path);
  const query = list(url.query).filter((item) => item.disabled !== true && str(item.key)).map((item) => `${str(item.key)}=${str(item.value)}`).join('&');
  const protocol = str(url.protocol);
  return `${protocol ? `${protocol}://` : ''}${host}${path ? `/${path}` : ''}${query ? `?${query}` : ''}`;
}

function pick(entries: unknown, key: string): string {
  return str(list(entries).find((entry) => entry.key === key)?.value);
}

/** Returns the mapped auth, `undefined` when the block is absent, or a string naming an unsupported type. */
function mapAuth(auth: unknown): AuthConfig | string | undefined {
  if (!isObj(auth) || !str(auth.type)) return undefined;
  const type = str(auth.type);
  if (type === 'noauth') return { type: 'none', token: '', username: '', password: '' };
  if (type === 'bearer') return { type: 'bearer', token: pick(auth.bearer, 'token'), username: '', password: '' };
  if (type === 'basic') return { type: 'basic', token: '', username: pick(auth.basic, 'username'), password: pick(auth.basic, 'password') };
  return type;
}

function hasHeader(headers: HeaderPair[], name: string): boolean {
  return headers.some((header) => header.name.toLowerCase() === name.toLowerCase());
}

function convertRequest(name: string, item: Obj, inherited: Inherited, skipped: string[]): ApiRequest {
  const raw = item.request;
  const request = createRequest();
  request.name = name;
  const source: Obj = typeof raw === 'string' ? { url: raw } : isObj(raw) ? raw : {};
  request.method = (str(source.method) || 'GET').toUpperCase();
  request.url = buildUrl(source.url);
  request.headers = list(source.header)
    .filter((header) => header.disabled !== true && str(header.key))
    .map((header) => ({ name: str(header.key), value: str(header.value) }));

  const body = isObj(source.body) ? source.body : undefined;
  const mode = str(body?.mode);
  if (mode === 'raw') {
    request.body = str(body?.raw);
    const language = isObj(body?.options) && isObj(body.options.raw) ? str(body.options.raw.language) : '';
    if (language === 'json' && !hasHeader(request.headers, 'content-type')) request.headers.push({ name: 'Content-Type', value: 'application/json' });
  } else if (mode === 'urlencoded') {
    request.body = list(body?.urlencoded)
      .filter((item) => item.disabled !== true && str(item.key))
      .map((item) => `${encodeURIComponent(str(item.key))}=${encodeURIComponent(str(item.value))}`)
      .join('&');
    if (!hasHeader(request.headers, 'content-type')) request.headers.push({ name: 'Content-Type', value: 'application/x-www-form-urlencoded' });
  } else if (mode === 'formdata') skipped.push(`${name}: form-data body`);
  else if (mode === 'graphql') {
    const graphql = isObj(body?.graphql) ? body.graphql : {};
    const variables = graphql.variables;
    request.bodyMode = 'graphql';
    request.graphql = {
      query: str(graphql.query),
      variables: typeof variables === 'string' ? variables : isObj(variables) ? JSON.stringify(variables, null, 2) : '',
    };
  }
  else if (mode) skipped.push(`${name}: ${mode} body`);

  const own = mapAuth(source.auth);
  if (typeof own === 'string') skipped.push(`${name}: ${own} auth`);
  else if (own) request.auth = own;
  else if (inherited) request.auth = inherited;
  const examples = list(item.response).map(convertExample);
  if (examples.length) request.examples = examples;
  return request;
}

function convertExample(source: Obj): StoredResponse {
  const code = typeof source.code === 'number' ? source.code : 0;
  const statusText = str(source.status);
  const stored = toStoredResponse({
    status: code,
    statusText,
    elapsed: null,
    headers: list(source.header).filter((header) => str(header.key)).map((header) => ({ name: str(header.key), value: str(header.value) })),
    body: str(source.body),
    truncated: false,
  }, str(source.name) || [code || '', statusText].filter(Boolean).join(' ') || 'Example');
  return stored;
}

function walk(items: Obj[], prefix: string, inherited: Inherited, out: ApiRequest[], skipped: string[]): void {
  for (const item of items) {
    const label = str(item.name) || 'Untitled';
    const name = prefix ? `${prefix} / ${label}` : label;
    const auth = mapAuth(item.auth);
    // An unsupported auth type on a folder/request must not leak the parent's auth; treat it as none.
    const effective: Inherited = typeof auth === 'string' ? undefined : auth ?? inherited;
    if (Array.isArray(item.item)) {
      if (typeof auth === 'string') skipped.push(`${name}: ${auth} auth`);
      walk(list(item.item), name, effective, out, skipped);
    } else if (item.request !== undefined) {
      out.push(convertRequest(name, item, effective, skipped));
    }
  }
}

export function parsePostman(input: unknown): PostmanImport {
  if (!isObj(input) || !isObj(input.info) || !SCHEMA_PATTERN.test(str(input.info.schema)) || !Array.isArray(input.item)) {
    throw new Error(NOT_POSTMAN);
  }
  const skipped: string[] = [];
  const requests: ApiRequest[] = [];
  const rootAuth = mapAuth(input.auth);
  if (typeof rootAuth === 'string') skipped.push(`Collection: ${rootAuth} auth`);
  walk(list(input.item), '', typeof rootAuth === 'string' ? undefined : rootAuth, requests, skipped);
  return {
    collection: { id: crypto.randomUUID(), name: str(input.info.name) || 'Imported collection', requests },
    skipped,
    variables: mapVariables(input.variable, (item) => item.disabled !== true),
  };
}

function mapVariables(entries: unknown, isEnabled: (item: Obj) => boolean, isSecret: (item: Obj) => boolean = () => false): EnvVariable[] {
  return list(entries)
    .filter((item) => str(item.key).trim())
    .map((item) => ({ key: str(item.key).trim(), value: typeof item.value === 'string' ? item.value : item.value == null ? '' : String(item.value), secret: isSecret(item), enabled: isEnabled(item) }));
}

export function isPostmanEnvironment(input: unknown): boolean {
  return isObj(input) && ['environment', 'globals'].includes(str(input._postman_variable_scope)) && Array.isArray(input.values);
}

export function parsePostmanEnvironment(input: unknown): Environment {
  if (!isPostmanEnvironment(input)) throw new Error('Not a Postman environment file.');
  const source = input as Obj;
  return createEnvironment(
    str(source.name).trim() || 'Imported environment',
    mapVariables(source.values, (item) => item.enabled !== false, (item) => item.type === 'secret'),
  );
}
