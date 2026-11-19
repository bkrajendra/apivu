import type { ApiRequest } from './request';

export type EnvVariable = {
  key: string;
  value: string;
  secret: boolean;
  enabled: boolean;
};

export type Environment = {
  id: string;
  name: string;
  variables: EnvVariable[];
};

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function createEnvironment(name: string, variables: EnvVariable[] = []): Environment {
  return { id: crypto.randomUUID(), name, variables };
}

export function createVariable(): EnvVariable {
  return { key: '', value: '', secret: false, enabled: true };
}

export function variableMap(environment: Environment | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const variable of environment?.variables ?? []) {
    if (variable.enabled && variable.key.trim()) map.set(variable.key.trim(), variable.value);
  }
  return map;
}

/** Replaces `{{name}}` with its value. Unknown names stay literal and are reported in `missing` (dynamic `$names` are ignored). */
export function resolveText(text: string, variables: Map<string, string>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const resolved = text.replace(PLACEHOLDER, (match, name: string) => {
    const value = variables.get(name);
    if (value !== undefined) return value;
    if (!name.startsWith('$') && !missing.includes(name)) missing.push(name);
    return match;
  });
  return { text: resolved, missing };
}

export function resolveRequest(request: ApiRequest, environment: Environment | undefined): { request: ApiRequest; missing: string[] } {
  const variables = variableMap(environment);
  const missing: string[] = [];
  const apply = (value: string): string => {
    const result = resolveText(value, variables);
    for (const name of result.missing) if (!missing.includes(name)) missing.push(name);
    return result.text;
  };
  const resolved: ApiRequest = {
    ...request,
    url: apply(request.url),
    headers: request.headers.map((header) => ({ name: apply(header.name), value: apply(header.value) })),
    body: apply(request.body),
    auth: {
      ...request.auth,
      token: apply(request.auth.token),
      username: apply(request.auth.username),
      password: apply(request.auth.password),
    },
  };
  return { request: resolved, missing };
}
