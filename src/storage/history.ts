import type { ApiRequest } from '../domain/request';

const STORAGE_KEY = 'history.v1';
export const HISTORY_LIMIT = 50;

export type HistoryEntry = {
  id: string;
  request: ApiRequest;
  status: number | null;
  elapsed: number | null;
  sentAt: number;
};

export async function loadHistory(): Promise<HistoryEntry[]> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as HistoryEntry[] | undefined) ?? [];
}

export async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: entries.slice(0, HISTORY_LIMIT) });
}

export function addHistoryEntry(entries: HistoryEntry[], entry: Omit<HistoryEntry, 'id'>): HistoryEntry[] {
  return [{ ...entry, id: crypto.randomUUID() }, ...entries].slice(0, HISTORY_LIMIT);
}
