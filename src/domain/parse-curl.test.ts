import { describe, expect, it } from 'vitest';
import { parseCurl } from './parse-curl';
import { exportCollections } from '../storage/collections';

describe('parseCurl', () => {
  it('extracts URL, method, headers, bearer auth, cookies, and body', () => {
    const result = parseCurl(`curl 'https://api.example.com/v1/users?active=true' \\
      -X POST -H 'Authorization: Bearer secret-token' \\
      -H 'Content-Type: application/json' -H 'Cookie: session=abc; theme=dark' \\
      --data-raw '{"name":"Ada Lovelace"}'`);

    expect(result.errors).toEqual([]);
    expect(result.request).toMatchObject({
      method: 'POST',
      url: 'https://api.example.com/v1/users?active=true',
      auth: { type: 'bearer', token: 'secret-token' },
      cookies: [{ name: 'session', value: 'abc' }, { name: 'theme', value: 'dark' }],
      body: '{"name":"Ada Lovelace"}',
    });
    expect(result.request?.headers).toEqual([{ name: 'Content-Type', value: 'application/json' }]);
  });

  it('joins line continuations and respects quoted spaces', () => {
    const result = parseCurl("curl \\\n+      --url 'https://api.example.com/search?q=hello%20world' \\\n+      -H 'X-Label: hello there'");

    expect(result.request?.url).toBe('https://api.example.com/search?q=hello%20world');
    expect(result.request?.headers[0]).toEqual({ name: 'X-Label', value: 'hello there' });
  });

  it('infers POST when data is supplied without a method', () => {
    const result = parseCurl("curl https://api.example.com/items -d 'a=1&b=2'");
    expect(result.request?.method).toBe('POST');
    expect(result.request?.body).toBe('a=1&b=2');
  });

  it('reports missing option values instead of throwing', () => {
    const result = parseCurl('curl -H');
    expect(result.request).toBeNull();
    expect(result.errors).toContain('Missing value for -H.');
  });

  it('does not treat file-backed data as literal body content', () => {
    const result = parseCurl('curl https://api.example.com --data-binary @payload.json');
    expect(result.request?.body).toBe('');
    expect(result.warnings).toContain('File-backed request bodies are not read; replace the file reference with its contents.');
  });

  it('recognizes the HEAD shortcut', () => {
    expect(parseCurl('curl -I https://api.example.com').request?.method).toBe('HEAD');
  });

  it('moves URL credentials into Basic auth fields', () => {
    const result = parseCurl('curl https://ada:secret@api.example.com/v1/users');
    expect(result.request?.url).toBe('https://api.example.com/v1/users');
    expect(result.request?.auth).toMatchObject({ type: 'basic', username: 'ada', password: 'secret' });
  });

  it('moves GET data into the URL', () => {
    const result = parseCurl("curl https://api.example.com/search -G -d 'q=hello%20world'");
    expect(result.request?.method).toBe('GET');
    expect(result.request?.url).toBe('https://api.example.com/search?q=hello%20world');
    expect(result.request?.body).toBe('');
  });

  it('surfaces unsupported options and rejects missing URLs', () => {
    const unsupported = parseCurl('curl https://api.example.com --insecure');
    expect(unsupported.request).not.toBeNull();
    expect(unsupported.warnings).toContain('Unsupported cURL option: --insecure');

    expect(parseCurl('curl -X GET').errors).toContain('No HTTP or HTTPS URL was found.');
  });

  it('rejects unmatched quotes and does not interpret shell operators', () => {
    expect(parseCurl("curl 'https://api.example.com").errors).toContain('Unclosed quote in cURL command.');
    const shell = parseCurl('curl https://api.example.com; echo unsafe');
    expect(shell.warnings).toContain('Unrecognized argument: ;');
    expect(shell.warnings).toContain('Unrecognized argument: echo');
    expect(shell.request?.url).toBe('https://api.example.com/');
  });

  it('redacts secrets from default collection exports', () => {
    const request = {
      id: 'request-1',
      name: 'Example',
      method: 'GET',
      url: 'https://ada:secret@api.example.com/?api_key=query-secret',
      headers: [
        { name: 'Authorization', value: 'Bearer header-secret' },
        { name: 'X-Api-Key', value: 'key-secret' },
        { name: 'Accept', value: 'application/json' },
      ],
      auth: { type: 'bearer' as const, token: 'token-secret', username: '', password: '' },
      cookies: [{ name: 'session', value: 'cookie-secret' }],
      body: '',
      sourceCurl: 'curl --secret source-secret',
      updatedAt: 0,
    };
    const collection = { id: 'collection-1', name: 'Example', requests: [request] };
    const exported = JSON.parse(exportCollections([collection], false)) as { collections: typeof collection[] };
    expect(exported.collections).toHaveLength(1);
    const saved = exported.collections.at(0)!.requests.at(0)!;

    expect(saved.url).not.toContain('ada');
    expect(saved.url).not.toContain('query-secret');
    expect(saved.headers.map(({ name }) => name)).toEqual(['Accept']);
    expect(saved.auth.token).toBe('');
    expect(saved.cookies.at(0)!.value).toBe('');
    expect(saved.sourceCurl).toBe('');
  });
});