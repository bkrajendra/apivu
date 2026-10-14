# Apivu

Apivu is a local-first Chrome extension for turning browser-copied cURL commands into editable REST API requests.

## Development

```sh
npm install
npm run dev
```

For a production build and package:

```sh
npm run compile
npm test
npm run build
npm run zip
```

Load the generated `.output/chrome-mv3` directory as an unpacked extension from `chrome://extensions`.

## Current scope

- Paste and parse common cURL commands, then review and edit method, URL, query parameters, headers, auth, cookies, and body.
- Send HTTP and HTTPS requests after granting access to that target host.
- Save named collections locally and export them as versioned JSON.
- Exported auth credentials, cookie values, source cURL, credential-bearing URLs, and common secret headers/query parameters are redacted by default. Request bodies are included and may contain secrets.
- Pasted cookie values are retained for reference but cannot be replayed as a manual `Cookie` header through Chrome Fetch. Browser-managed cookies are opt-in.
- cURL is parsed as data and is never executed. Unsupported options and shell syntax are not interpreted.

The extension does not capture page contents or browser network traffic. Saved collections remain on this device; Chrome extension storage is not encrypted by Apivu.
