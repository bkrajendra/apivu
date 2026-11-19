import { describe, expect, it } from 'vitest';
import { applyGraphql, buildGraphqlPayload } from './graphql';
import { createRequest } from './request';

describe('buildGraphqlPayload', () => {
  it('serialises query and parsed variables', () => {
    const result = buildGraphqlPayload({ query: 'query($id: ID!) { u(id: $id) { name } }', variables: '{ "id": 7 }' });
    expect(JSON.parse((result as { body: string }).body)).toEqual({ query: 'query($id: ID!) { u(id: $id) { name } }', variables: { id: 7 } });
  });
  it('omits variables when blank', () => {
    expect(JSON.parse((buildGraphqlPayload({ query: '{ a }', variables: '  ' }) as { body: string }).body)).toEqual({ query: '{ a }' });
    expect(JSON.parse((buildGraphqlPayload(undefined) as { body: string }).body)).toEqual({ query: '' });
  });
  it('rejects invalid or non-object variables', () => {
    expect(buildGraphqlPayload({ query: '{ a }', variables: '{bad' })).toEqual({ error: 'GraphQL variables must be valid JSON.' });
    expect(buildGraphqlPayload({ query: '{ a }', variables: '[1]' })).toEqual({ error: 'GraphQL variables must be a JSON object.' });
    expect(buildGraphqlPayload({ query: '{ a }', variables: '"x"' })).toEqual({ error: 'GraphQL variables must be a JSON object.' });
  });
});

describe('applyGraphql', () => {
  const base = { ...createRequest(), method: 'POST', bodyMode: 'graphql' as const, graphql: { query: '{ a }', variables: '' } };
  it('sets body and Content-Type', () => {
    const result = applyGraphql(base) as { request: typeof base };
    expect(result.request.body).toBe('{"query":"{ a }"}');
    expect(result.request.headers).toEqual([{ name: 'Content-Type', value: 'application/json' }]);
  });
  it('keeps an existing content-type', () => {
    const result = applyGraphql({ ...base, headers: [{ name: 'content-type', value: 'application/graphql+json' }] }) as { request: typeof base };
    expect(result.request.headers).toEqual([{ name: 'content-type', value: 'application/graphql+json' }]);
  });
  it('passes non-graphql requests through untouched', () => {
    const raw = { ...createRequest(), body: 'x' };
    expect(applyGraphql(raw)).toEqual({ request: raw });
  });
  it('surfaces variable errors', () => {
    expect(applyGraphql({ ...base, graphql: { query: '{ a }', variables: '{' } })).toEqual({ error: 'GraphQL variables must be valid JSON.' });
  });
});
