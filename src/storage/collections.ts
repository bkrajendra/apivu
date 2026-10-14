import type { ApiRequest, SavedCollection } from '../domain/request';

const STORAGE_KEY = 'collections.v1';
const SECRET_FIELD = /auth|cookie|token|secret|password|passwd|credential|session|api[_-]?key/i;

export async function loadCollections(): Promise<SavedCollection[]> {
  await browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as SavedCollection[] | undefined) ?? [];
}

export async function saveCollections(collections: SavedCollection[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: collections });
}

export function createCollectionId(): string {
  return crypto.randomUUID();
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const key of Array.from(url.searchParams.keys())) {
      if (SECRET_FIELD.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return value;
  }
}

export function exportCollections(collections: SavedCollection[], includeSecrets: boolean): string {
  const exported = collections.map((collection) => ({
    ...collection,
    requests: collection.requests.map((request: ApiRequest) => {
      if (includeSecrets) return request;
      return {
        ...request,
        url: redactUrl(request.url),
        sourceCurl: '',
        auth: { ...request.auth, token: '', password: '' },
        cookies: request.cookies.map((cookie) => ({ ...cookie, value: '' })),
        headers: request.headers.filter((header) => !SECRET_FIELD.test(header.name)),
      };
    }),
  }));

  return JSON.stringify({ format: 'apivu-collection', version: 1, collections: exported }, null, 2);
}