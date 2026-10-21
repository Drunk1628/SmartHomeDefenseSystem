import {
  bigint,
  varchar,
  text,
  timestamp,
  index,
  check,
  pgTable,
  foreignKey,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { devices } from "./devices";
import { users } from "./users";

export const securityAlerts = pgTable(
  "security_alerts",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),

    deviceId: bigint("device_id", { mode: "number" }),

    alertType: varchar("alert_type", { length: 50 }).notNull(),

    severity: varchar("severity", { length: 20 }).notNull(),

    description: text("description").notNull(),

    alertStatus: varchar("alert_status", { length: 20 })
      .notNull()
      .default("open"),

    detectionSource: varchar("detection_source", { length: 50 })
      .notNull()
      .default("system"),

    detectedAt: timestamp("detected_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),

    resolvedAt: timestamp("resolved_at", {
      withTimezone: true,
      mode: "date",
    }),

    resolvedBy: bigint("resolved_by", { mode: "number" }),
  },
  (table) => [
    foreignKey({
      name: "fk_security_alerts_device",
      columns: [table.deviceId],
      foreignColumns: [devices.id],
    }).onDelete("set null"),

    foreignKey({
      name: "fk_security_alerts_resolved_by",
      columns: [table.resolvedBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),

    check(
      "security_alerts_severity_check",
      sql`${table.severity} IN ('low', 'medium', 'high', 'critical')`,
    ),

    check(
      "security_alerts_status_check",
      sql`${table.alertStatus} IN ('open', 'investigating', 'resolved')`,
    ),

    check(
      "chk_security_alert_resolution",
      sql`(
        (${table.alertStatus} = 'resolved' AND ${table.resolvedAt} IS NOT NULL)
        OR
        (${table.alertStatus} <> 'resolved' AND ${table.resolvedAt} IS NULL)
      )`,
    ),

    index("idx_security_alerts_status_time").on(
      table.alertStatus,
      table.detectedAt.desc(),
    ),

    index("idx_security_alerts_severity").on(table.severity),

    index("idx_security_alerts_device_time").on(
      table.deviceId,
      table.detectedAt.desc(),
    ),

    index("idx_security_alerts_source").on(table.detectionSource),
  ],
);
