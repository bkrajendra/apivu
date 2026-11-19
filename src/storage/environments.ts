import type { Environment } from '../domain/environment';

const STORAGE_KEY = 'environments.v1';

export type EnvironmentState = { environments: Environment[]; activeId: string | null };

export async function loadEnvironments(): Promise<EnvironmentState> {
  await browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const state = stored[STORAGE_KEY] as EnvironmentState | undefined;
  return { environments: state?.environments ?? [], activeId: state?.activeId ?? null };
}

export async function saveEnvironments(state: EnvironmentState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state });
}

/** Adds the imported environment, or merges into a same-named one (matching keys overwritten, new keys appended). */
export function mergeImportedEnvironment(existing: Environment[], imported: Environment): Environment[] {
  if (imported.variables.length === 0) return existing;
  const match = existing.find((environment) => environment.name.toLowerCase() === imported.name.toLowerCase());
  if (!match) return [...existing, imported];
  const incoming = new Map(imported.variables.map((variable) => [variable.key, variable]));
  const updated = match.variables.map((variable) => incoming.get(variable.key) ?? variable);
  const known = new Set(match.variables.map((variable) => variable.key));
  const added = imported.variables.filter((variable) => !known.has(variable.key));
  return existing.map((environment) => (environment === match ? { ...match, variables: [...updated, ...added] } : environment));
}
