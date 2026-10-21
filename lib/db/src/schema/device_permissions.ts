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
import { users } from "./users";
import { devices } from "./devices";

export const devicePermissions = pgTable(
  "device_permissions",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),

    userId: bigint("user_id", { mode: "number" }).notNull(),

    deviceId: bigint("device_id", { mode: "number" }).notNull(),

    permission: varchar("permission", { length: 30 }).notNull(),

    grantedBy: bigint("granted_by", { mode: "number" }),

    grantedAt: timestamp("granted_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "fk_device_permissions_user",
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),

    foreignKey({
      name: "fk_device_permissions_device",
      columns: [table.deviceId],
      foreignColumns: [devices.id],
    }).onDelete("restrict"),

    foreignKey({
      name: "fk_device_permissions_granted_by",
      columns: [table.grantedBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),

    check(
      "device_permissions_permission_check",
      sql`${table.permission} IN ('view', 'control', 'manage')`,
    ),

    unique("uq_device_permission").on(
      table.userId,
      table.deviceId,
      table.permission,
    ),

    index("idx_device_permissions_user_id").on(table.userId),
    index("idx_device_permissions_device_id").on(table.deviceId),
  ],
);
