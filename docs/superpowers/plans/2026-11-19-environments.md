# Environments (with Postman environment import) — design + plan

Branch: feat/environments. User asked to implement environments and make Postman environment import work; design calls below are mine, flagged for review.

## Design
- Model: `Environment { id, name, variables: EnvVariable[] }`, `EnvVariable { key, value, secret, enabled }`. Stored in `browser.storage.local` key `environments.v1` as `{ environments, activeId }` (TRUSTED_CONTEXTS like collections). Not part of collection export.
- Substitution: `{{name}}` (whitespace trimmed) resolved from the **active** environment's enabled variables, single pass, at **send time only** to URL, header names/values, body, bearer token, basic username/password. Saved requests keep their placeholders. Unresolved names stay literal and are listed in a send warning. `{{$dynamic}}` names are left alone without warning.
- UI: Environments view (list, add/rename/delete, set active, edit variable rows with secret mask + enabled toggle); active-environment select above the URL row in Requests view.
- Postman: one "Import Postman" handler detects file kind. Environment/globals files (`_postman_variable_scope` of `environment` or `globals`, `values[]`, type `secret` -> secret, `enabled:false` -> disabled) become an environment. A collection file's `variable[]` becomes an environment named "<collection> variables" created alongside the collection. Same-name environment: matching keys overwritten, new keys added.
- Non-goals: recursive variable resolution, per-collection scoping, pre-request scripts, exporting environments.

## Tasks (TDD, vitest)
1. `src/domain/environment.ts`: `createEnvironment`, `resolveText`, `resolveRequest`. Test: `environment.test.ts`.
2. `parse-postman.ts`: `parsePostmanEnvironment`, `isPostmanEnvironment`, collection `variables`. Tests in `parse-postman.test.ts`.
3. `src/storage/environments.ts`: load/save, `mergeImportedEnvironment`. Test: `environments.test.ts`.
4. UI wiring in `App.tsx`/`App.css`, README, settings "Clear environments".
