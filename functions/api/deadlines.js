const DATA_KEY = "deadline-submissions-v1";
const PEOPLE_KEY = "deadline-people-v1";
const DEFAULT_PEOPLE = ["Fred", "Ayan"];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

async function readItems(namespace) {
  const stored = await namespace.get(DATA_KEY, "json");
  const items = Array.isArray(stored) ? stored : [];
  return items;
}

function isAdmin(context) {
  const supplied = (context.request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return Boolean(supplied && ((context.env.TRACKER_ADMIN_KEY && supplied === context.env.TRACKER_ADMIN_KEY) ||
    (context.env.ADMIN_KEY && supplied === context.env.ADMIN_KEY)));
}

async function archiveDb(context) {
  const db = context.env.TRACKER_DB;
  if (!db) return null;
  await db.prepare("CREATE TABLE IF NOT EXISTS deadline_archive (id TEXT PRIMARY KEY, payload TEXT NOT NULL, archived_at TEXT NOT NULL)").run();
  return db;
}

async function readPeople(namespace) {
  const stored = await namespace.get(PEOPLE_KEY, "json");
  return Array.isArray(stored) && stored.length ? stored : DEFAULT_PEOPLE;
}

export async function onRequestGet(context) {
  if (!context.env.DEADLINES) return json({ error: "Storage binding is not configured." }, 503);
  const url = new URL(context.request.url);
  if (url.searchParams.get("view") === "people") return json({ people: await readPeople(context.env.DEADLINES) });
  const view = url.searchParams.get("view");
  if (view === "archive" || view === "archiveCsv") {
    if (!isAdmin(context)) return json({ error: "Admin key required." }, 401);
    const db = await archiveDb(context);
    if (!db) return json({ error: "Archive database binding is not configured." }, 503);
    const records = await db.prepare("SELECT payload FROM deadline_archive ORDER BY archived_at DESC").all();
    const items = records.results.map(row => JSON.parse(row.payload));
    if (view === "archive") return json({ items });
    const columns = ["id", "submittedBy", "title", "description", "deadline", "submittedAt", "completedAt", "updatedAt"];
    const labels = ["ID", "Submitted By", "Deliverable", "Description", "Deadline", "Submitted At", "Completed At", "Last Updated At"];
    const cell = value => {
      let text = String(value ?? "");
      if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const csv = [labels, ...items.map(item => columns.map(key => item[key] ?? ""))].map(row => row.map(cell).join(",")).join("\r\n");
    return new Response("\uFEFF" + csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"cortexgrip-completed-deadlines.csv\"",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  }
  const items = await readItems(context.env.DEADLINES);
  const db = await archiveDb(context);
  if (!db) return json({ items });
  const completed = items.filter(item => item.done);
  for (const item of completed) {
    await db.prepare("INSERT OR IGNORE INTO deadline_archive (id, payload, archived_at) VALUES (?, ?, ?)").bind(
      item.id, JSON.stringify(item), item.completedAt || new Date().toISOString()
    ).run();
  }
  if (completed.length) await context.env.DEADLINES.put(DATA_KEY, JSON.stringify(items.filter(item => !item.done)));
  const archived = await db.prepare("SELECT id FROM deadline_archive").all();
  const archivedIds = new Set(archived.results.map(row => row.id));
  return json({ items: items.filter(item => !archivedIds.has(item.id) && !item.done) });
}

export async function onRequestPost(context) {
  if (!context.env.DEADLINES) return json({ error: "Storage binding is not configured." }, 503);
  let input;
  try {
    input = await context.request.json();
  } catch {
    return json({ error: "Invalid submission." }, 400);
  }

  if (input.action === "setPeople") {
    const people = [...new Set((Array.isArray(input.people) ? input.people : []).map(name => clean(name, 60)).filter(Boolean))].slice(0, 100);
    if (!people.length) return json({ error: "Add at least one person." }, 400);
    await context.env.DEADLINES.put(PEOPLE_KEY, JSON.stringify(people));
    return json({ ok: true, people });
  }

  if (input.action === "archiveItem") {
    if (!isAdmin(context)) return json({ error: "Admin key required." }, 401);
    const db = await archiveDb(context);
    if (!db) return json({ error: "Archive database binding is not configured." }, 503);
    const id = clean(input.id, 80), items = await readItems(context.env.DEADLINES);
    const item = items.find(entry => entry.id === id);
    if (!item) {
      const existing = await db.prepare("SELECT id FROM deadline_archive WHERE id = ?").bind(id).first();
      return existing ? json({ ok: true, archived: true }) : json({ error: "Deliverable not found." }, 404);
    }
    const title = clean(input.title, 140), description = clean(input.description, 1200), deadline = clean(input.deadline, 10);
    if (!title || !description || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return json({ error: "Complete the title, brief description, and deadline." }, 400);
    const archivedAt = new Date().toISOString();
    const saved = { ...item, title, description, deadline, done: true, completedAt: archivedAt, updatedAt: archivedAt };
    await db.prepare("INSERT OR IGNORE INTO deadline_archive (id, payload, archived_at) VALUES (?, ?, ?)").bind(id, JSON.stringify(saved), archivedAt).run();
    await context.env.DEADLINES.put(DATA_KEY, JSON.stringify(items.filter(entry => entry.id !== id)));
    return json({ ok: true, archived: true });
  }

  if (input.action === "deleteItem") {
    if (!isAdmin(context)) return json({ error: "Admin key required." }, 401);
    const id = clean(input.id, 80), items = await readItems(context.env.DEADLINES);
    if (!items.some(entry => entry.id === id)) return json({ error: "Deliverable not found." }, 404);
    await context.env.DEADLINES.put(DATA_KEY, JSON.stringify(items.filter(entry => entry.id !== id)));
    return json({ ok: true, deleted: true });
  }

  if (input.action === "updateItem") {
    if (!isAdmin(context)) return json({ error: "Admin key required." }, 401);
    const id = clean(input.id, 80), items = await readItems(context.env.DEADLINES), item = items.find(entry => entry.id === id);
    if (!item) return json({ error: "Deliverable not found." }, 404);
    const title = clean(input.title, 140), description = clean(input.description, 1200), deadline = clean(input.deadline, 10);
    if (!title || !description || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return json({ error: "Complete the title, brief description, and deadline." }, 400);
    if (input.done === true) return json({ error: "Use the confirmed archive action to complete a deliverable." }, 400);
    Object.assign(item, { title, description, deadline, done: false, completedAt: null, updatedAt: new Date().toISOString() });
    await context.env.DEADLINES.put(DATA_KEY, JSON.stringify(items));
    return json({ ok: true, item });
  }

  if (clean(input.company, 100)) return json({ ok: true });
  const submittedBy = clean(input.submittedBy, 60);
  const people = await readPeople(context.env.DEADLINES);
  if (!people.includes(submittedBy)) return json({ error: "Choose your name from the list." }, 400);
  const raw = Array.isArray(input.deliverables) ? input.deliverables.slice(0, 25) : [input];
  const submittedAt = new Date().toISOString();
  const created = raw.map(entry => ({ id: crypto.randomUUID(), submittedBy, title: clean(entry.title, 140), description: clean(entry.description, 1200), deadline: clean(entry.deadline, 10), submittedAt, done: false, completedAt: null }));
  if (!created.length || created.some(item => !item.title || !item.description || !/^\d{4}-\d{2}-\d{2}$/.test(item.deadline))) return json({ error: "Complete the title, brief description, and deadline for every deliverable." }, 400);
  const items = await readItems(context.env.DEADLINES);
  await context.env.DEADLINES.put(DATA_KEY, JSON.stringify([...created.reverse(), ...items].slice(0, 500)));

  return json({ ok: true, count: created.length }, 201);
}
