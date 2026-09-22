// Paste this into Extensions > Apps Script on your personal Google Sheet.
// Add a Script Property named ARCHIVE_KEY with a long random value before deploying.
const ARCHIVE_TAB = "Completed deadlines";
const HEADERS = ["ID", "Submitted By", "Deliverable", "Description", "Deadline", "Submitted At", "Completed At", "Last Updated At"];

function reply(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeText(value) {
  const text = String(value == null ? "" : value);
  return /^\s*[=+@-]/.test(text) ? "'" + text : text;
}

function archiveSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(ARCHIVE_TAB);
  if (!sheet) sheet = book.insertSheet(ARCHIVE_TAB);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (error) { return reply({ ok: false, error: "Invalid request." }); }
  const expected = PropertiesService.getScriptProperties().getProperty("ARCHIVE_KEY");
  if (!expected || body.key !== expected) return reply({ ok: false, error: "Invalid archive key." });
  if (body.action === "ping") {
    try { return reply({ ok: true, sheet: archiveSheet().getName() }); }
    catch (error) { return reply({ ok: false, error: String(error) }); }
  }
  if (body.action !== "archive" || !body.item || !body.item.id) return reply({ ok: false, error: "Invalid archive item." });
  const item = body.item;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sheet = archiveSheet();
    const id = String(item.id);
    const exists = sheet.getLastRow() > 1 &&
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
    if (!exists) {
      sheet.appendRow([
        safeText(id), safeText(item.submittedBy), safeText(item.title), safeText(item.description),
        safeText(item.deadline), safeText(item.submittedAt), safeText(item.completedAt), safeText(item.updatedAt),
      ]);
      SpreadsheetApp.flush();
    }
    return reply({ ok: true, id, alreadyPresent: Boolean(exists) });
  } catch (error) {
    return reply({ ok: false, error: String(error) });
  } finally {
    try { lock.releaseLock(); } catch (error) {}
  }
}
