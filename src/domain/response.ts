import type { HeaderPair } from './request';

export const MAX_STORED_BODY = 200_000;

export type StoredResponse = {
  id: string;
  name: string;
  status: number;
  statusText: string;
  elapsed: number | null;
  headers: HeaderPair[];
  body: string;
  truncated: boolean;
  savedAt: number;
};

export type ResponseView = {
  status: number;
  statusText: string;
  elapsed: number | null;
  headers: HeaderPair[];
  body: string;
  truncated: boolean;
};

export function toStoredResponse(view: ResponseView, name: string): StoredResponse {
  const tooLong = view.body.length > MAX_STORED_BODY;
  return {
    id: crypto.randomUUID(),
    name,
    status: view.status,
    statusText: view.statusText,
    elapsed: view.elapsed,
    headers: view.headers.map((header) => ({ ...header })),
    body: tooLong ? view.body.slice(0, MAX_STORED_BODY) : view.body,
    truncated: view.truncated || tooLong,
    savedAt: Date.now(),
  };
}

export function toResponseView(stored: StoredResponse): ResponseView {
  const { status, statusText, elapsed, headers, body, truncated } = stored;
  return { status, statusText, elapsed, headers, body, truncated };
}
