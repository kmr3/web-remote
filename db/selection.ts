import { env } from "cloudflare:workers";

export type PublishedSelection = {
  deviceIds: string[];
  sceneIds: string[];
};

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS published_items (
    kind TEXT NOT NULL CHECK (kind IN ('device', 'scene')),
    id TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (kind, id)
  )
`;

export async function readPublishedSelection(): Promise<PublishedSelection> {
  const database = getDatabase();
  await ensureSchema(database);
  const result = await database
    .prepare("SELECT kind, id FROM published_items ORDER BY kind, id")
    .all<{ id: string; kind: "device" | "scene" }>();

  const selection: PublishedSelection = { deviceIds: [], sceneIds: [] };
  for (const row of result.results) {
    if (row.kind === "device") selection.deviceIds.push(row.id);
    if (row.kind === "scene") selection.sceneIds.push(row.id);
  }
  return selection;
}

export async function replacePublishedSelection(selection: PublishedSelection): Promise<void> {
  const database = getDatabase();
  await ensureSchema(database);
  const timestamp = Date.now();
  const statements = [database.prepare("DELETE FROM published_items")];

  for (const id of selection.deviceIds) {
    statements.push(
      database
        .prepare("INSERT INTO published_items (kind, id, updated_at) VALUES (?, ?, ?)")
        .bind("device", id, timestamp),
    );
  }
  for (const id of selection.sceneIds) {
    statements.push(
      database
        .prepare("INSERT INTO published_items (kind, id, updated_at) VALUES (?, ?, ?)")
        .bind("scene", id, timestamp),
    );
  }

  await database.batch(statements);
}

export async function isPublished(kind: "device" | "scene", id: string): Promise<boolean> {
  const database = getDatabase();
  await ensureSchema(database);
  const row = await database
    .prepare("SELECT 1 AS found FROM published_items WHERE kind = ? AND id = ? LIMIT 1")
    .bind(kind, id)
    .first<{ found: number }>();
  return row?.found === 1;
}

function getDatabase(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable.");
  return env.DB;
}

async function ensureSchema(database: D1Database): Promise<void> {
  await database.prepare(CREATE_TABLE_SQL).run();
}
