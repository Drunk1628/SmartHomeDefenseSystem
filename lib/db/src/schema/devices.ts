import {
  bigint,
  varchar,
  timestamp,
  index,
  check,
  unique,
  pgTable,
  foreignKey,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { homes } from "./homes";

export const devices = pgTable(
  "devices",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),

    homeId: bigint("home_id", { mode: "number" }).notNull(),

    deviceName: varchar("device_name", { length: 100 }).notNull(),

    deviceType: varchar("device_type", { length: 50 }).notNull(),

    deviceIdentifier: varchar("device_identifier", { length: 255 })
      .notNull(),

    ipAddress: varchar("ip_address", { length: 45 }),

    room: varchar("room", { length: 100 }),

    firmwareVersion: varchar("firmware_version", { length: 100 }),

    trustStatus: varchar("trust_status", { length: 20 })
      .notNull()
      .default("untrusted"),

    connectionStatus: varchar("connection_status", { length: 20 })
      .notNull()
      .default("unknown"),

    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      mode: "date",
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "fk_devices_home",
      columns: [table.homeId],
      foreignColumns: [homes.id],
    }).onDelete("restrict"),

    check(
      "devices_trust_status_check",
      sql`${table.trustStatus} IN ('trusted', 'untrusted', 'quarantined')`,
    ),

    check(
      "devices_connection_status_check",
      sql`${table.connectionStatus} IN ('online', 'offline', 'unknown')`,
    ),

    unique("uq_devices_identifier").on(table.deviceIdentifier),

    index("idx_devices_home_id").on(table.homeId),

    index("idx_devices_trust_status").on(table.trustStatus),

    index("idx_devices_connection_status").on(table.connectionStatus),
  ],
);
