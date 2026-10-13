function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestGet(context) {
  const db = context.env.TRACKER_DB;
  if (!db) return json({ error: "Public organisation chart is unavailable." }, 503);
  await db.prepare("CREATE TABLE IF NOT EXISTS org_chart_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, html TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
  const row = await db.prepare("SELECT html, updated_at FROM org_chart_state WHERE id = 1").first();
  if (!row) return json({ html: "", updatedAt: null });
  return json({
    html: typeof row.html === "string" ? row.html : "",
    updatedAt: row.updated_at,
  });
}
