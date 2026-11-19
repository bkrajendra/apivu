import { describe, expect, it } from 'vitest';
import { createRequest, type SavedCollection } from '../domain/request';
import { mergeImportedCollection } from './collections';

const make = (name: string, count: number): SavedCollection => ({
  id: crypto.randomUUID(),
  name,
  requests: Array.from({ length: count }, (_, index) => ({ ...createRequest(), name: `r${index}` })),
});

describe('mergeImportedCollection', () => {
  it('appends to a same-named collection case-insensitively with fresh ids', () => {
    const existing = [make('Demo', 1)];
    const imported = make('demo', 2);
    const result = mergeImportedCollection(existing, imported);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(existing[0].id);
    expect(result[0].requests).toHaveLength(3);
    const ids = result[0].requests.map((request) => request.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.slice(1)).not.toContain(imported.requests[0].id);
  });

  it('adds a new collection when no name matches', () => {
    const result = mergeImportedCollection([make('A', 1)], make('B', 2));
    expect(result.map((collection) => collection.name)).toEqual(['A', 'B']);
    expect(result[1].requests).toHaveLength(2);
  });

  it('returns existing content unchanged for an empty import', () => {
    const existing = [make('A', 1)];
    expect(mergeImportedCollection(existing, make('B', 0))).toEqual(existing);
  });

  it('does not mutate its inputs', () => {
    const existing = [make('A', 1)];
    const snapshot = JSON.stringify(existing);
    mergeImportedCollection(existing, make('A', 2));
    expect(JSON.stringify(existing)).toBe(snapshot);
  });

  it('importing the same collection twice keeps every request', () => {
    const imported = make('A', 2);
    const once = mergeImportedCollection([], imported);
    const twice = mergeImportedCollection(once, imported);
    expect(twice[0].requests).toHaveLength(4);
  });
});
