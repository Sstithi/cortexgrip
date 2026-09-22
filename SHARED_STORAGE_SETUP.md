# Shared CortexGrip tracker setup

This branch moves tracker edits to a Cloudflare D1 database. The page no longer saves tracker edits in `localStorage`. The previous browser data is read only during an explicit one-time import. The theme setting still uses browser storage.

## Cloudflare setup before merging

1. In the Cloudflare account that owns the `cortexgriptracker` Pages project, create a D1 database named `cortexgrip-tracker`.
2. Open **Workers & Pages → cortexgriptracker → Settings → Bindings → Add → D1 database**. Set the variable name exactly `TRACKER_DB` and select the database. Configure production (and preview if testing previews).
3. In **Settings → Variables and Secrets**, add an encrypted secret named `TRACKER_ADMIN_KEY` with a long random value. Do not put that value in GitHub or in the HTML. Configure production (and preview if needed).
4. Redeploy after changing bindings and secrets. The API creates its own table on first authorized request.
5. Open the live site in the browser containing the latest edits. Enter the tracker key, choose **Import browser data**, and confirm the task count. Once cloud saving is shown, reopen the site on another device using the same key and confirm edits appear.

The first import only works while the database is empty. It uses this browser's prior `localStorage` value, or the HTML's embedded snapshot when no browser value exists. Keep the original browser data and an export until verification.

The API rejects updates made from an out-of-date page, rather than silently overwriting newer edits. A conflict or connection error blocks editing and offers a JSON backup of unsaved data before reload. This is a shared key for everyone who edits; for individual user permissions, add a login system. Existing tracker data remains embedded in the public HTML and public repository history, so the shared key does not make that historical snapshot private.
