import { env } from "cloudflare:workers";

export type BatchActionDefinition = {
  actionId: string;
  deviceIds: string[];
  name: string;
};

const CREATE_ACTIONS_SQL = `
  CREATE TABLE IF NOT EXISTS batch_actions (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

const CREATE_DEVICES_SQL = `
  CREATE TABLE IF NOT EXISTS batch_action_devices (
    action_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (action_id, device_id)
  )
`;

export async function readBatchActions(): Promise<BatchActionDefinition[]> {
  const database = getDatabase();
  await ensureSchema(database);
  const [actions, devices] = await Promise.all([
    database
      .prepare("SELECT id, name FROM batch_actions ORDER BY created_at, id")
      .all<{ id: string; name: string }>(),
    database
      .prepare("SELECT action_id, device_id FROM batch_action_devices ORDER BY action_id, position")
      .all<{ action_id: string; device_id: string }>(),
  ]);

  const deviceIdsByAction = new Map<string, string[]>();
  for (const row of devices.results) {
    const current = deviceIdsByAction.get(row.action_id) ?? [];
    current.push(row.device_id);
    deviceIdsByAction.set(row.action_id, current);
  }

  return actions.results.map((action) => ({
    actionId: action.id,
    deviceIds: deviceIdsByAction.get(action.id) ?? [],
    name: action.name,
  }));
}

export async function readBatchAction(actionId: string): Promise<BatchActionDefinition | null> {
  const actions = await readBatchActions();
  return actions.find((action) => action.actionId === actionId) ?? null;
}

export async function saveBatchAction(input: {
  actionId?: string;
  deviceIds: string[];
  name: string;
}): Promise<string> {
  const database = getDatabase();
  await ensureSchema(database);
  const actionId = input.actionId ?? crypto.randomUUID();
  const timestamp = Date.now();
  const statements = [
    database
      .prepare(
        `INSERT INTO batch_actions (id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
      )
      .bind(actionId, input.name, timestamp, timestamp),
    database.prepare("DELETE FROM batch_action_devices WHERE action_id = ?").bind(actionId),
  ];

  input.deviceIds.forEach((deviceId, position) => {
    statements.push(
      database
        .prepare(
          "INSERT INTO batch_action_devices (action_id, device_id, position) VALUES (?, ?, ?)",
        )
        .bind(actionId, deviceId, position),
    );
  });

  await database.batch(statements);
  return actionId;
}

export async function deleteBatchAction(actionId: string): Promise<void> {
  const database = getDatabase();
  await ensureSchema(database);
  await database.batch([
    database.prepare("DELETE FROM batch_action_devices WHERE action_id = ?").bind(actionId),
    database.prepare("DELETE FROM batch_actions WHERE id = ?").bind(actionId),
  ]);
}

function getDatabase(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable.");
  return env.DB;
}

async function ensureSchema(database: D1Database): Promise<void> {
  await database.batch([
    database.prepare(CREATE_ACTIONS_SQL),
    database.prepare(CREATE_DEVICES_SQL),
  ]);
}
