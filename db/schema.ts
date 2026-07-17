import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const publishedItems = sqliteTable(
  "published_items",
  {
    id: text("id").notNull(),
    kind: text("kind", { enum: ["device", "scene"] }).notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.id] })],
);

export const devicePowerStates = sqliteTable("device_power_states", {
  deviceId: text("device_id").primaryKey(),
  power: text("power", { enum: ["off", "on"] }).notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const batchActions = sqliteTable("batch_actions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const batchActionDevices = sqliteTable(
  "batch_action_devices",
  {
    actionId: text("action_id").notNull(),
    deviceId: text("device_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.actionId, table.deviceId] })],
);
