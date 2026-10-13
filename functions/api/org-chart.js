const MAX_BYTES = 512 * 1024;

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

function authorized(context) {
  const key = context.env.TRACKER_ADMIN_KEY;
  const header = context.request.headers.get("Authorization") || "";
  return Boolean(key && header.startsWith("Bearer ") && header.slice(7) === key);
}

async function database(context) {
  const db = context.env.TRACKER_DB;
  if (!db) return null;
  await db.prepare("CREATE TABLE IF NOT EXISTS org_chart_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, html TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
  return db;
}

export async function onRequestGet(context) {
  if (!authorized(context)) return json({ error: "Tracker key required." }, 401);
  const db = await database(context);
  if (!db) return json({ error: "TRACKER_DB binding is missing." }, 503);
  const row = await db.prepare("SELECT version, html, updated_at FROM org_chart_state WHERE id = 1").first();
  return json(row ? { version: row.version, html: row.html, updatedAt: row.updated_at } : { version: 0, html: "", updatedAt: null });
}

export async function onRequestPut(context) {
  if (!authorized(context)) return json({ error: "Tracker key required." }, 401);
  const db = await database(context);
  if (!db) return json({ error: "TRACKER_DB binding is missing." }, 503);
  const body = await context.request.text();
  if (body.length > MAX_BYTES) return json({ error: "Organisation chart exceeds 512 KB." }, 413);
  let input;
  try { input = JSON.parse(body); } catch { return json({ error: "Invalid JSON." }, 400); }
  const { version, html } = input || {};
  if (!Number.isSafeInteger(version) || version < 0 || typeof html !== "string" || !html.trim()) return json({ error: "Invalid organisation chart." }, 400);
  const now = new Date().toISOString();
  let result;
  if (version === 0) result = await db.prepare("INSERT OR IGNORE INTO org_chart_state (id, version, html, updated_at) VALUES (1, 1, ?, ?)").bind(html, now).run();
  else result = await db.prepare("UPDATE org_chart_state SET version = version + 1, html = ?, updated_at = ? WHERE id = 1 AND version = ?").bind(html, now, version).run();
  if (!result.meta.changes) return json({ error: "The organisation chart changed elsewhere. Reload before saving again." }, 409);
  return json({ ok: true, version: version + 1, updatedAt: now });
}
