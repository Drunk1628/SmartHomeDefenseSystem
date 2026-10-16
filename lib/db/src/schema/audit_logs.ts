import {
  bigint,
  varchar,
  timestamp,
  index,
  check,
  pgTable,
  foreignKey,
  inet,
  jsonb,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { users } from "./users";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),

    actorUserId: bigint("actor_user_id", { mode: "number" }),

    action: varchar("action", { length: 100 }).notNull(),

    resourceType: varchar("resource_type", { length: 50 }).notNull(),

    resourceId: varchar("resource_id", { length: 100 }),

    outcome: varchar("outcome", { length: 20 }).notNull(),

    sourceIp: inet("source_ip"),

    details: jsonb("details"),

    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "fk_audit_logs_actor",
      columns: [table.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),

    check(
      "audit_logs_outcome_check",
      sql`${table.outcome} IN ('success', 'denied', 'failure')`,
    ),

    index("idx_audit_logs_actor_time").on(
      table.actorUserId,
      table.occurredAt.desc(),
    ),

    index("idx_audit_logs_action_time").on(
      table.action,
      table.occurredAt.desc(),
    ),

    index("idx_audit_logs_resource").on(
      table.resourceType,
      table.resourceId,
    ),

    index("idx_audit_logs_outcome_time").on(
      table.outcome,
      table.occurredAt.desc(),
    ),
  ],
);
