<div align="center">

<img src="public/icons/128.png" alt="apiVU logo" width="96" height="96">

# apiVU

**cURL in. Requests out.**

Apivu is a local-first Chrome extension for turning browser-copied cURL commands into editable REST API requests.

[![CI](https://github.com/bkrajendra/apivu/actions/workflows/ci.yml/badge.svg)](https://github.com/bkrajendra/apivu/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/bkrajendra/apivu)](https://github.com/bkrajendra/apivu/releases/latest)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-install-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/apivu/cnefbhibneloegcfbjjecmpimfhjadme)

</div>

## How to use

1. **Install** apiVU from the [Chrome Web Store](https://chromewebstore.google.com/detail/apivu/cnefbhibneloegcfbjjecmpimfhjadme), then pin it to the toolbar.
2. **Copy a request as cURL** in your browser: open DevTools → **Network**, right-click a request → **Copy** → **Copy as cURL**.
3. **Open apiVU** by clicking its toolbar icon. It opens in the side panel next to your page.
4. **Paste the cURL** into the **Paste cURL** box. The method, URL, query parameters, headers, auth, cookies and body are filled in for you.
5. **Edit the request** using the tabs. Change the URL, add or remove headers, switch auth, or edit the body.
6. **Send it.** The first time you call a host, Chrome asks you to grant access to it. Approve it, then click **Send**.
7. **Read the response** in the response panel, with **Pretty** and **Raw** views plus the response headers.
8. **Save it** to a named collection to reuse later. Open **Saved requests** to find it, and use **Export collection** to download a versioned JSON file. Secrets are redacted in exports by default.

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


## Release
To release: 
- bump the version in package.json, commit, then run 

```bash
git tag v0.1.2 && git push --tags
```

- Approve the run in GitHub. 
- The update then goes through Google's review.