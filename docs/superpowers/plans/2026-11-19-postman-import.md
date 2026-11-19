# Postman Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Postman Collection v2.0/v2.1 JSON files into apivu saved collections.

**Architecture:** A pure parser (`parse-postman.ts`) converts Postman JSON to a `SavedCollection` plus a list of skipped items. A pure merge helper in `collections.ts` appends it to existing collections. `App.tsx` adds an Import button and file handler.

**Tech Stack:** TypeScript, React 19, WXT, Vitest (`npm test`, `npm run compile`).

**Spec:** `docs/superpowers/specs/2026-11-19-postman-import-design.md`

## Global Constraints

- Supports Postman schema v2.0 and v2.1 only; anything else is rejected with a clear error.
- Local only: file read in the browser, nothing uploaded.
- Folders flattened; folder path becomes name prefix, e.g. "Users / Create user".
- `{{variables}}` left as literal text.
- Skipped items (form-data and GraphQL bodies, unsupported auth types) are counted and reported in the notice. Scripts are ignored without being reported.
- Same-named collection (case-insensitive) is appended to; every imported request gets a fresh `crypto.randomUUID()` id; nothing is overwritten.
- Disabled headers/params are skipped.

## Review Focus

- Non-JSON or non-Postman file (e.g. apivu export, empty file): error notice, storage untouched.
- Collection with zero requests: notice says nothing imported, no empty collection saved.
- `url` as plain string vs object, and object with no `raw`: both produce a usable URL.
- Auth on collection/folder inherited; request-level `noauth` overrides inheritance.
- Same file imported twice: requests duplicated with new ids, none lost.

---

### Task 1: Postman parser

**Files:**
- Create: `src/domain/parse-postman.ts`
- Test: `src/domain/parse-postman.test.ts`

**Interfaces:**
- Produces: `parsePostman(input: unknown): { collection: SavedCollection; skipped: string[] }`. Throws `Error` with message starting "Not a Postman collection" for invalid input or unsupported schema. Uses `createRequest()` from `./request` as the base for each request.

- [ ] **Step 1: Write failing tests** in `parse-postman.test.ts`, each with a small inline fixture:
  - `rejects non-postman input`: `parsePostman({})` and `parsePostman('x')` throw /Not a Postman collection/; schema `.../v1.0.0/...` throws.
  - `maps a basic request`: GET with url `{ raw: 'https://a.com/x?y=1' }`, a header, → method `GET`, url `https://a.com/x?y=1`, headers `[{name,value}]`, request name, collection name = `info.name`.
  - `builds url from parts when raw is missing` (`protocol`, `host: ['a','com']`, `path: ['x','y']`, `query: [{key:'q',value:'1'}]` → `https://a.com/x/y?q=1`); and plain string url.
  - `flattens folders into name prefix`: nested folder "Users" > "Admin" > request "Create" → name `Users / Admin / Create`.
  - `skips disabled headers`.
  - `raw body`, `urlencoded body` (→ `a=1&b=2`, adds Content-Type `application/x-www-form-urlencoded` if absent), JSON raw with `options.raw.language: 'json'` adds `application/json` if absent.
  - `bearer and basic auth` mapped to `AuthConfig`; collection-level bearer inherited by a request without auth; request `{type:'noauth'}` overrides it.
  - `skips unsupported`: formdata body, graphql body, `oauth2` auth → request still imported without that part, and `skipped` contains one entry per item naming the request (e.g. `Users / Create: form-data body`).
  - `each request gets unique id`, and `empty collection` returns zero requests.

- [ ] **Step 2: Run** `npx vitest run src/domain/parse-postman.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement `parsePostman`** per the tests. Detect version via `info.schema` containing `/collection/v2.0` or `/collection/v2.1`. Postman bearer/basic auth are arrays of `{key,value}` under `auth.bearer` / `auth.basic`. Walk `item[]` recursively, items with an `item` array are folders; pass inherited auth down.

- [ ] **Step 4: Run** the test file and `npm run compile` — expect PASS, no type errors.

- [ ] **Step 5: Commit** `feat: parse Postman collections`

### Task 2: Merge helper

**Files:**
- Modify: `src/storage/collections.ts`
- Test: `src/storage/collections.test.ts`

**Interfaces:**
- Consumes: `SavedCollection`.
- Produces: `mergeImportedCollection(existing: SavedCollection[], imported: SavedCollection): SavedCollection[]` — pure, does not mutate `existing`; case-insensitive name match appends imported requests (new `crypto.randomUUID()` ids), otherwise adds a new collection with a new `createCollectionId()`; returns `existing` unchanged if `imported.requests` is empty.

- [ ] **Step 1: Write failing tests**: appends to same-named collection (case-insensitive) with new ids; adds new collection when no match; empty import returns same content; input arrays not mutated. (`createCollectionId`/storage import `browser` only inside functions, so the module imports fine under Vitest; if not, move the helper to `src/domain/merge-collections.ts` and adjust paths.)
- [ ] **Step 2: Run** `npx vitest run src/storage/collections.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `mergeImportedCollection` in `collections.ts`.
- [ ] **Step 4: Run** tests and `npm run compile` — expect PASS.
- [ ] **Step 5: Commit** `feat: merge imported collections`

### Task 3: Import UI

**Files:**
- Modify: `entrypoints/sidepanel/App.tsx` (collections heading at ~line 770-778, empty state at ~779, handlers near `handleExport` ~line 527; add `Upload` to the lucide-react import)

**Interfaces:**
- Consumes: `parsePostman`, `mergeImportedCollection`, `saveCollections`, existing `setCollections` / `setNotice`.

- [ ] **Step 1: Add `handleImportFile(file: File)`**: read with `file.text()`, `JSON.parse`, `parsePostman`, `mergeImportedCollection`, `setCollections`, `saveCollections`. Notices: success `Imported N requests into "<name>"` plus ` (M skipped)` when skipped is non-empty; zero requests → `No requests found in this collection.`; parse/JSON errors → the error message (`Not a Postman collection...` or `Could not read this file as JSON.`); storage failure → `Could not update local storage.`. Do not call `saveCollections` on any error path.
- [ ] **Step 2: Add UI**: hidden `<input type="file" accept=".json,application/json">` (ref'd, value reset after each pick so the same file can be re-imported), and an "Import" secondary button (`Upload` icon) beside Export JSON in the heading; also an Import button inside the empty state. Show the skipped list in the notice area is not required: count only.
- [ ] **Step 3: Verify**: `npm run compile` and `npm test` pass; `npm run build`, load the built extension, import a real Postman export (and an invalid JSON file), confirm requests appear and open correctly, and re-import duplicates rather than overwrites.
- [ ] **Step 4: Update README** with a one-line Import mention under features, then commit `feat: import Postman collections from the collections view`.
