export type HeaderPair = {
  name: string;
  value: string;
};

export type AuthConfig = {
  type: 'none' | 'bearer' | 'basic';
  token: string;
  username: string;
  password: string;
};

export type ApiRequest = {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: HeaderPair[];
  auth: AuthConfig;
  cookies: HeaderPair[];
  body: string;
  sourceCurl: string;
  updatedAt: number;
};

export type SavedCollection = {
  id: string;
  name: string;
  requests: ApiRequest[];
};

export function createRequest(): ApiRequest {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled request',
    method: 'GET',
    url: '',
    headers: [],
    auth: { type: 'none', token: '', username: '', password: '' },
    cookies: [],
    body: '',
    sourceCurl: '',
    updatedAt: Date.now(),
  };
}