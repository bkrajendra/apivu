import { describe, expect, it } from 'vitest';
import { parsePostman } from './parse-postman';

const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const col = (item: unknown[], extra: Record<string, unknown> = {}) => ({ info: { name: 'Demo', schema: SCHEMA }, item, ...extra });
const req = (name: string, request: Record<string, unknown>) => ({ name, request });

describe('parsePostman', () => {
  it('rejects non-postman input', () => {
    expect(() => parsePostman({})).toThrow(/Not a Postman collection/);
    expect(() => parsePostman('x')).toThrow(/Not a Postman collection/);
    expect(() => parsePostman(null)).toThrow(/Not a Postman collection/);
    expect(() => parsePostman({ info: { name: 'x', schema: 'https://schema.getpostman.com/json/collection/v1.0.0/collection.json' }, item: [] })).toThrow(/Not a Postman collection/);
  });

  it('accepts v2.0 schema', () => {
    const result = parsePostman({ info: { name: 'Old', schema: 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json' }, item: [] });
    expect(result.collection.name).toBe('Old');
  });

  it('maps a basic request', () => {
    const { collection, skipped } = parsePostman(col([
      req('Get x', { method: 'GET', url: { raw: 'https://a.com/x?y=1' }, header: [{ key: 'X-A', value: '1' }] }),
    ]));
    expect(skipped).toEqual([]);
    expect(collection.name).toBe('Demo');
    expect(collection.requests).toHaveLength(1);
    expect(collection.requests[0]).toMatchObject({ name: 'Get x', method: 'GET', url: 'https://a.com/x?y=1', headers: [{ name: 'X-A', value: '1' }] });
  });

  it('builds url from parts or a plain string', () => {
    const { collection } = parsePostman(col([
      req('parts', { method: 'GET', url: { protocol: 'https', host: ['a', 'com'], path: ['x', 'y'], query: [{ key: 'q', value: '1' }, { key: 'off', value: '2', disabled: true }] } }),
      req('str', { method: 'GET', url: 'https://b.com/z' }),
      req('none', { method: 'GET' }),
    ]));
    expect(collection.requests.map((r) => r.url)).toEqual(['https://a.com/x/y?q=1', 'https://b.com/z', '']);
  });

  it('accepts a plain string request', () => {
    const { collection } = parsePostman(col([{ name: 'S', request: 'https://c.com' }]));
    expect(collection.requests[0]).toMatchObject({ method: 'GET', url: 'https://c.com' });
  });

  it('flattens folders into a name prefix', () => {
    const { collection } = parsePostman(col([
      { name: 'Users', item: [{ name: 'Admin', item: [req('Create', { method: 'POST', url: 'https://a.com' })] }] },
    ]));
    expect(collection.requests[0].name).toBe('Users / Admin / Create');
  });

  it('skips disabled headers', () => {
    const { collection } = parsePostman(col([
      req('h', { method: 'GET', url: 'https://a.com', header: [{ key: 'A', value: '1', disabled: true }, { key: 'B', value: '2' }] }),
    ]));
    expect(collection.requests[0].headers).toEqual([{ name: 'B', value: '2' }]);
  });

  it('maps raw, json and urlencoded bodies', () => {
    const { collection } = parsePostman(col([
      req('raw', { method: 'POST', url: 'https://a.com', body: { mode: 'raw', raw: 'hello' } }),
      req('json', { method: 'POST', url: 'https://a.com', body: { mode: 'raw', raw: '{"a":1}', options: { raw: { language: 'json' } } } }),
      req('json-keep', { method: 'POST', url: 'https://a.com', header: [{ key: 'content-type', value: 'text/x' }], body: { mode: 'raw', raw: '{}', options: { raw: { language: 'json' } } } }),
      req('form', { method: 'POST', url: 'https://a.com', body: { mode: 'urlencoded', urlencoded: [{ key: 'a', value: '1 2' }, { key: 'b', value: '&', disabled: true }, { key: 'c', value: '3' }] } }),
    ]));
    const [raw, json, keep, form] = collection.requests;
    expect(raw.body).toBe('hello');
    expect(raw.headers).toEqual([]);
    expect(json.headers).toEqual([{ name: 'Content-Type', value: 'application/json' }]);
    expect(keep.headers).toEqual([{ name: 'content-type', value: 'text/x' }]);
    expect(form.body).toBe('a=1%202&c=3');
    expect(form.headers).toEqual([{ name: 'Content-Type', value: 'application/x-www-form-urlencoded' }]);
  });

  it('maps bearer and basic auth, with inheritance and noauth override', () => {
    const bearer = { type: 'bearer', bearer: [{ key: 'token', value: 'tok' }] };
    const { collection, skipped } = parsePostman(col([
      req('inherits', { method: 'GET', url: 'https://a.com' }),
      req('basic', { method: 'GET', url: 'https://a.com', auth: { type: 'basic', basic: [{ key: 'username', value: 'u' }, { key: 'password', value: 'p' }] } }),
      req('off', { method: 'GET', url: 'https://a.com', auth: { type: 'noauth' } }),
      { name: 'F', auth: { type: 'basic', basic: [{ key: 'username', value: 'fu' }, { key: 'password', value: 'fp' }] }, item: [req('in-folder', { method: 'GET', url: 'https://a.com' })] },
    ], { auth: bearer }));
    const [inherits, basic, off, inFolder] = collection.requests;
    expect(inherits.auth).toMatchObject({ type: 'bearer', token: 'tok' });
    expect(basic.auth).toMatchObject({ type: 'basic', username: 'u', password: 'p' });
    expect(off.auth.type).toBe('none');
    expect(inFolder.auth).toMatchObject({ type: 'basic', username: 'fu', password: 'fp' });
    expect(skipped).toEqual([]);
  });

  it('skips unsupported content but keeps the request', () => {
    const { collection, skipped } = parsePostman(col([
      { name: 'Users', item: [
        req('Upload', { method: 'POST', url: 'https://a.com', body: { mode: 'formdata', formdata: [] } }),
        req('Gql', { method: 'POST', url: 'https://a.com', body: { mode: 'graphql', graphql: {} } }),
        req('Oauth', { method: 'GET', url: 'https://a.com', auth: { type: 'oauth2' } }),
      ] },
    ]));
    expect(collection.requests).toHaveLength(3);
    expect(collection.requests.every((r) => r.body === '' && r.auth.type === 'none')).toBe(true);
    expect(skipped).toEqual(['Users / Upload: form-data body', 'Users / Gql: GraphQL body', 'Users / Oauth: oauth2 auth']);
  });

  it('gives each request a unique id and handles empty collections', () => {
    const { collection } = parsePostman(col([req('a', { method: 'GET', url: 'x' }), req('b', { method: 'GET', url: 'x' })]));
    expect(new Set(collection.requests.map((r) => r.id)).size).toBe(2);
    expect(parsePostman(col([])).collection.requests).toEqual([]);
  });

  it('upper-cases the method and defaults to GET', () => {
    const { collection } = parsePostman(col([req('a', { method: 'post', url: 'x' }), req('b', { url: 'x' })]));
    expect(collection.requests.map((r) => r.method)).toEqual(['POST', 'GET']);
  });
});
