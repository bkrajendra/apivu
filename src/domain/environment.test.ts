import { describe, expect, it } from 'vitest';
import { createEnvironment, findVariableTokens, lookupVariable, resolveRequest, resolveText, variableMap } from './environment';
import { createRequest } from './request';

const env = createEnvironment('Dev', [
  { key: 'baseUrl', value: 'https://dev.example.com', secret: false, enabled: true },
  { key: 'token', value: 'abc', secret: true, enabled: true },
  { key: 'off', value: 'no', secret: false, enabled: false },
]);

describe('resolveText', () => {
  it('replaces placeholders, trimming whitespace in names', () => {
    expect(resolveText('{{baseUrl}}/a/{{ token }}', variableMap(env))).toEqual({ text: 'https://dev.example.com/a/abc', missing: [] });
  });
  it('leaves unknown and disabled names literal and reports them once', () => {
    expect(resolveText('{{nope}}{{nope}}{{off}}', variableMap(env))).toEqual({ text: '{{nope}}{{nope}}{{off}}', missing: ['nope', 'off'] });
  });
  it('ignores dynamic $variables without reporting', () => {
    expect(resolveText('{{$guid}}', variableMap(env))).toEqual({ text: '{{$guid}}', missing: [] });
  });
  it('does not resolve recursively', () => {
    const nested = createEnvironment('N', [{ key: 'a', value: '{{b}}', secret: false, enabled: true }, { key: 'b', value: 'x', secret: false, enabled: true }]);
    expect(resolveText('{{a}}', variableMap(nested)).text).toBe('{{b}}');
  });
  it('keeps $ replacement patterns in values literal', () => {
    const special = createEnvironment('S', [{ key: 'p', value: "$& $1 $'", secret: false, enabled: true }]);
    expect(resolveText('{{p}}', variableMap(special)).text).toBe("$& $1 $'");
  });
});

describe('resolveRequest', () => {
  it('resolves url, headers, body and auth without mutating the original', () => {
    const request = { ...createRequest(), url: '{{baseUrl}}/x', body: '{"t":"{{token}}"}', headers: [{ name: 'X-{{token}}', value: 'Bearer {{token}}' }], auth: { type: 'basic' as const, token: '', username: '{{token}}', password: '{{missing}}' } };
    const { request: out, missing } = resolveRequest(request, env);
    expect(out.url).toBe('https://dev.example.com/x');
    expect(out.body).toBe('{"t":"abc"}');
    expect(out.headers).toEqual([{ name: 'X-abc', value: 'Bearer abc' }]);
    expect(out.auth.username).toBe('abc');
    expect(missing).toEqual(['missing']);
    expect(request.url).toBe('{{baseUrl}}/x');
  });
  it('reports every placeholder as missing when there is no environment', () => {
    const request = { ...createRequest(), url: '{{baseUrl}}/x' };
    expect(resolveRequest(request, undefined)).toMatchObject({ missing: ['baseUrl'] });
  });
});

describe('findVariableTokens', () => {
  it('returns name and range of each placeholder', () => {
    expect(findVariableTokens('a {{x}} b{{ y }}')).toEqual([{ start: 2, end: 7, name: 'x' }, { start: 9, end: 16, name: 'y' }]);
    expect(findVariableTokens('none')).toEqual([]);
  });
});

describe('lookupVariable', () => {
  it('reports value, secret, missing, no environment and dynamic', () => {
    expect(lookupVariable(env, 'baseUrl')).toEqual({ status: 'ok', value: 'https://dev.example.com', secret: false, environment: 'Dev' });
    expect(lookupVariable(env, 'token')).toMatchObject({ status: 'ok', secret: true });
    expect(lookupVariable(env, 'off')).toEqual({ status: 'missing', environment: 'Dev' });
    expect(lookupVariable(env, 'nope')).toEqual({ status: 'missing', environment: 'Dev' });
    expect(lookupVariable(undefined, 'x')).toEqual({ status: 'noenv' });
    expect(lookupVariable(env, '$guid')).toEqual({ status: 'dynamic' });
  });
});

describe('percent-encoded placeholders in urls', () => {
  it('does not throw on malformed escapes', () => {
    const request = { ...createRequest(), url: 'https://a.com/%7B%7Bbad%zz%7D%7D' };
    expect(() => resolveRequest(request, env)).not.toThrow();
  });
  it('resolves placeholders that URL re-serialisation encoded', () => {
    const request = { ...createRequest(), url: 'https://a.com/x?t=%7B%7Btoken%7D%7D&u=%7B%7B%20token%20%7D%7D' };
    expect(resolveRequest(request, env).request.url).toBe('https://a.com/x?t=abc&u=abc');
  });
});

describe('resolveRequest with graphql', () => {
  it('resolves variables inside the query and variables text', () => {
    const request = { ...createRequest(), bodyMode: 'graphql' as const, graphql: { query: '{ user(token: "{{token}}") }', variables: '{"base":"{{baseUrl}}","m":"{{missing}}"}' } };
    const { request: out, missing } = resolveRequest(request, env);
    expect(out.graphql).toEqual({ query: '{ user(token: "abc") }', variables: '{"base":"https://dev.example.com","m":"{{missing}}"}' });
    expect(missing).toEqual(['missing']);
  });
});
