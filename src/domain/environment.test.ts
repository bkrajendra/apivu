import { describe, expect, it } from 'vitest';
import { createEnvironment, resolveRequest, resolveText, variableMap } from './environment';
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
