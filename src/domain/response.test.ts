import { describe, expect, it } from 'vitest';
import { MAX_STORED_BODY, toResponseView, toStoredResponse } from './response';

const view = { status: 200, statusText: 'OK', elapsed: 12, headers: [{ name: 'A', value: '1' }], body: '{"a":1}', truncated: false };

describe('stored responses', () => {
  it('round-trips a response view', () => {
    const stored = toStoredResponse(view, 'Latest');
    expect(stored).toMatchObject({ name: 'Latest', status: 200, body: '{"a":1}', truncated: false });
    expect(toResponseView(stored)).toEqual(view);
  });
  it('caps long bodies and marks them truncated', () => {
    const stored = toStoredResponse({ ...view, body: 'x'.repeat(MAX_STORED_BODY + 5) }, 'Big');
    expect(stored.body).toHaveLength(MAX_STORED_BODY);
    expect(stored.truncated).toBe(true);
  });
  it('copies headers instead of sharing them', () => {
    const stored = toStoredResponse(view, 'Latest');
    stored.headers[0]!.value = 'changed';
    expect(view.headers[0]!.value).toBe('1');
  });
});
