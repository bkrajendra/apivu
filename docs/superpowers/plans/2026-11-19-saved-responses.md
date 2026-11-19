# Saved responses, Postman examples, variable hover — design + plan

Branch: feat/saved-responses. Calls below are mine, flagged for review.

## Design
- `ApiRequest` gains optional `lastResponse?: StoredResponse` and `examples?: StoredResponse[]` (old saved data stays valid).
- **Save** stores the response currently shown from the last send as `lastResponse` (replacing the previous one); examples are untouched. If nothing has been sent, existing stored responses are kept.
- **Opening** a saved request shows its `lastResponse`; a "Response" select appears when examples exist.
- **Postman import**: `item.response[]` becomes `examples` (name, code, status text, headers, body).
- Stored bodies are capped at 200 KB (marked truncated) to protect the ~10 MB `storage.local` quota.
- History entries never carry stored responses. Export without secrets drops secret-named response headers (e.g. Set-Cookie); bodies are included like request bodies and may contain secrets.
- Variable hover: single-line fields (URL, params, headers, basic user) get a highlight layer and a popover on `{{name}}` showing the resolved value (secret values masked unless "Reveal secrets" is on; "not defined" / "no environment" states). Secret/password-typed fields are excluded.
- Placeholders percent-encoded by URL re-serialisation (`%7B%7Bname%7D%7D`) resolve at send time.

## Tasks (TDD)
1. `src/domain/response.ts` + test. 2. Postman `response[]` -> examples + test. 3. `environment.ts`: `findVariableTokens`, `lookupVariable`, encoded placeholders + test. 4. Export redaction + test. 5. `VarInput` component + CSS. 6. App wiring, README.
