const MAX_BYTES = 1024 * 1024;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function database(context) {
  const db = context.env.TRACKER_DB;
  if (!db) return null;
  await db.prepare("CREATE TABLE IF NOT EXISTS tracker_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
  return db;
}

function authorized(context) {
  const key = context.env.TRACKER_ADMIN_KEY;
  const header = context.request.headers.get("Authorization") || "";
  return Boolean(key && header.startsWith("Bearer ") && header.slice(7) === key);
}

export async function onRequestGet(context) {
  if (!authorized(context)) return json({ error: "Tracker key required." }, 401);
  const db = await database(context);
  if (!db) return json({ error: "TRACKER_DB binding is missing." }, 503);
  const row = await db.prepare("SELECT version, payload, updated_at FROM tracker_state WHERE id = 1").first();
  return json(row ? { version: row.version, data: JSON.parse(row.payload), updatedAt: row.updated_at } : { version: 0, data: null });
}

export async function onRequestPut(context) {
  if (!authorized(context)) return json({ error: "Tracker key required." }, 401);
  const db = await database(context);
  if (!db) return json({ error: "TRACKER_DB binding is missing." }, 503);
  const body = await context.request.text();
  if (body.length > MAX_BYTES) return json({ error: "Tracker data exceeds 1 MB." }, 413);
  let input;
  try { input = JSON.parse(body); } catch { return json({ error: "Invalid JSON." }, 400); }
  const { version, data } = input || {};
  if (!Number.isSafeInteger(version) || version < 0 || !data ||
      !Array.isArray(data.products) || !Array.isArray(data.tasks) ||
      !Array.isArray(data.meetingPeople) || !Array.isArray(data.meetingNotes) ||
      !Array.isArray(data.diagramTaskOrder)) {
    return json({ error: "Invalid tracker data." }, 400);
  }
  const payload = JSON.stringify(data);
  const now = new Date().toISOString();
  let result;
  if (version === 0) {
    result = await db.prepare("INSERT OR IGNORE INTO tracker_state (id, version, payload, updated_at) VALUES (1, 1, ?, ?)").bind(payload, now).run();
  } else {
    result = await db.prepare("UPDATE tracker_state SET version = version + 1, payload = ?, updated_at = ? WHERE id = 1 AND version = ?").bind(payload, now, version).run();
  }
  if (!result.meta.changes) return json({ error: "The tracker changed elsewhere. Reload before editing again." }, 409);
  return json({ ok: true, version: version + 1, updatedAt: now });
}
