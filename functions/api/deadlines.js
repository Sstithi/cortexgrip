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
  return Array.isArray(stored) ? stored : [];
}

async function readPeople(namespace) {
  const stored = await namespace.get(PEOPLE_KEY, "json");
  return Array.isArray(stored) && stored.length ? stored : DEFAULT_PEOPLE;
}

export async function onRequestGet(context) {
  if (!context.env.DEADLINES) return json({ error: "Storage binding is not configured." }, 503);
  const url = new URL(context.request.url);
  if (url.searchParams.get("view") === "people") return json({ people: await readPeople(context.env.DEADLINES) });
  const items = await readItems(context.env.DEADLINES);
  return json({ items });
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

  if (input.action === "updateItem") {
    const suppliedKey = (context.request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!context.env.ADMIN_KEY || suppliedKey !== context.env.ADMIN_KEY) return json({ error: "Admin key required." }, 401);
    const id = clean(input.id, 80), items = await readItems(context.env.DEADLINES), item = items.find(entry => entry.id === id);
    if (!item) return json({ error: "Deliverable not found." }, 404);
    const title = clean(input.title, 140), description = clean(input.description, 1200), deadline = clean(input.deadline, 10);
    if (!title || !description || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return json({ error: "Complete the title, brief description, and deadline." }, 400);
    Object.assign(item, { title, description, deadline, updatedAt: new Date().toISOString() });
    await context.env.DEADLINES.put(DATA_KEY, JSON.stringify(items));
    return json({ ok: true, item });
  }

  if (clean(input.company, 100)) return json({ ok: true });
  const submittedBy = clean(input.submittedBy, 60);
  const people = await readPeople(context.env.DEADLINES);
  if (!people.includes(submittedBy)) return json({ error: "Choose your name from the list." }, 400);
  const raw = Array.isArray(input.deliverables) ? input.deliverables.slice(0, 25) : [input];
  const submittedAt = new Date().toISOString();
  const created = raw.map(entry => ({ id: crypto.randomUUID(), submittedBy, title: clean(entry.title, 140), description: clean(entry.description, 1200), deadline: clean(entry.deadline, 10), submittedAt }));
  if (!created.length || created.some(item => !item.title || !item.description || !/^\d{4}-\d{2}-\d{2}$/.test(item.deadline))) return json({ error: "Complete the title, brief description, and deadline for every deliverable." }, 400);
  const items = await readItems(context.env.DEADLINES);
  await context.env.DEADLINES.put(DATA_KEY, JSON.stringify([...created.reverse(), ...items].slice(0, 500)));

  return json({ ok: true, count: created.length }, 201);
}
