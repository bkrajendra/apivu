import { describe, expect, it } from 'vitest';
import { createEnvironment } from '../domain/environment';
import { mergeImportedEnvironment } from './environments';

const v = (key: string, value: string) => ({ key, value, secret: false, enabled: true });

describe('mergeImportedEnvironment', () => {
  it('adds a new environment', () => {
    const existing = [createEnvironment('Dev', [v('a', '1')])];
    const result = mergeImportedEnvironment(existing, createEnvironment('Prod', [v('a', '2')]));
    expect(result.map((environment) => environment.name)).toEqual(['Dev', 'Prod']);
  });
  it('merges into a same-named environment: overwrites matching keys, adds new ones, keeps others and the id', () => {
    const existing = [createEnvironment('Dev', [v('a', '1'), v('keep', 'k')])];
    const result = mergeImportedEnvironment(existing, createEnvironment('dev', [v('a', '9'), v('b', '2')]));
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(existing[0]!.id);
    expect(result[0]!.variables).toEqual([v('a', '9'), v('keep', 'k'), v('b', '2')]);
  });
  it('returns existing unchanged for an environment without variables', () => {
    const existing = [createEnvironment('Dev', [v('a', '1')])];
    expect(mergeImportedEnvironment(existing, createEnvironment('Empty'))).toEqual(existing);
  });
  it('does not mutate its inputs', () => {
    const existing = [createEnvironment('Dev', [v('a', '1')])];
    const snapshot = JSON.stringify(existing);
    mergeImportedEnvironment(existing, createEnvironment('Dev', [v('a', '2')]));
    expect(JSON.stringify(existing)).toBe(snapshot);
  });
});
