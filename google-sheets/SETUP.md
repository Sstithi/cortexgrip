# Google Sheets completed-deadline archive

The Google Sheet is the destination for newly completed deadline updates. The existing D1 archive remains a backup, and the completed CSV export remains available. A completion request writes a row to Google Sheets first; if Google does not confirm it, the update stays active.

## Create the Google Sheet

1. In your personal Google account, create a Google Sheet named CortexGrip Completed Deadlines. The script creates a tab called `Completed deadlines` with these columns if it is missing: ID, Submitted By, Deliverable, Description, Deadline, Submitted At, Completed At, Last Updated At.
2. From the sheet, open **Extensions → Apps Script**. Replace the starter code with `google-sheets/Code.gs` from this branch and save.
3. Open Apps Script **Project Settings → Script Properties**, add `ARCHIVE_KEY` with a long random value, and save it in your password manager. Do not paste it into the public repository.
4. Choose **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Authorize the script with your Google account. Copy the deployment URL ending in `/exec`. Anyone who knows this endpoint can call it, but the code rejects calls lacking the secret key.
5. In Cloudflare Pages project `cortexgriptracker` under **Settings → Variables and Secrets**, add the encrypted Production secrets `GOOGLE_SHEETS_WEBHOOK_URL` (the `/exec` URL) and `GOOGLE_SHEETS_ARCHIVE_KEY` (the same value as `ARCHIVE_KEY`). Redeploy after the secrets are set.
6. In the tracker, paste the ordinary Google Sheet URL into the dashboard's spreadsheet link field. This link is for opening the sheet and is different from the Apps Script `/exec` URL.
7. Use **Test sheet connection**. It must say connected before marking a deadline Done. Mark one test item Done and verify its ID and title are present in the Google Sheet.

Do not merge this branch before the new dashboard UI is approved and the Google Script and Cloudflare settings are ready. Previously archived records stay in D1 and can be downloaded as CSV; this integration writes new completed records.
