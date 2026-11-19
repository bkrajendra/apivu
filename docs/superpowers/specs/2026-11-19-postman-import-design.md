# Postman collection import — design (approved 2026-11-19)

## Intent
Let users open Postman collections shared with them, and eventually move a whole Postman workspace into apivu so their team can adopt it.

## Goals
- Import Postman Collection v2.0/v2.1 JSON into apivu saved collections.
- Local only: file read via FileReader, nothing uploaded.

## Non-goals
- Postman environments files (likely follow-up; matters for team migration since `{{variables}}` are kept as literal text).
- Nested folders (apivu collections are flat), form-data file uploads, GraphQL, scripts, OAuth and other auth types.
- Importing apivu's own export format (cheap follow-up).

## Anti-goals
- Overwriting or losing existing saved requests.
- Silently dropping content without telling the user.

## Approaches
1. **Flat import, folder path in request name (chosen).** No schema/UI change.
2. Nested folder model. Faithful, but changes storage schema and collections UI; separate feature.
3. One apivu collection per top-level folder. Loses deeper structure, surprising names.

## Design
- UI: "Import" button beside "Export JSON" in the Collections heading, and in the empty state. Hidden `<input type="file" accept=".json">`.
- `src/domain/parse-postman.ts`: pure function `parsePostman(json) -> { collection: SavedCollection, skipped: string[] }`, unit-tested. Rejects non-v2.0/2.1 with a clear error.
- Mapping: name, method, url (`raw` or built from parts), headers (disabled skipped), body (raw / urlencoded / JSON), bearer and basic auth. Auth on a folder/collection is inherited by requests without their own. `{{variables}}` left as-is. Folder path becomes name prefix ("Users / Create user").
- Skipped items counted and reported in the notice.
- Duplicates: same-named collection (case-insensitive) gets requests appended; every imported request gets a fresh id.
- Storage via existing `saveCollections`.

## Left to the builder
Exact notice wording, URL reconstruction details, test fixtures.
