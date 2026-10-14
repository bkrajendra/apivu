# Apivu Privacy Policy

Apivu is a local-first Chrome extension for creating and sending REST API requests from cURL commands pasted by the user.

## Information Apivu handles

When you save a request, Apivu stores its URL, method, headers, authentication values, cookie values, request body, collection name, and source cURL in Chrome's local extension storage on your device. This storage is not encrypted by Apivu. Apivu does not use Chrome Sync, operate a data-collection backend, or send saved collections to the extension developer.

When you choose **Send**, Apivu sends the request directly from your browser to the API host shown in the request. That host receives the request data and normal connection information such as your IP address. The API host's own privacy terms apply to that interaction. Apivu requests optional access to the request's host when needed; you can deny that permission and the request will not be sent.

Apivu does not collect browsing history, page contents, or browser network traffic. It does not use analytics or advertising trackers.

## Exports and deletion

Collection exports are downloaded to a file on your device. By default, Apivu redacts common authentication, cookie, and URL secret fields. Request bodies are included and may themselves contain sensitive data. You can explicitly choose to include auth and cookie secrets in an export; protect that file accordingly.

Delete individual requests in the saved-requests view, or use **Clear local data** to delete all saved collections. Uninstalling Apivu also removes its extension storage through Chrome.

## Contact

Before publishing, replace this section with the extension publisher's support contact and host this policy at a public URL linked from the Chrome Web Store listing.