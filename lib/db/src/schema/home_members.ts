
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
import { homes } from "./homes";

export const homeMembers = pgTable(
  "home_members",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),

    homeId: bigint("home_id", { mode: "number" }).notNull(),

    userId: bigint("user_id", { mode: "number" }).notNull(),

    role: varchar("role", { length: 20 })
      .notNull()
      .default("member"),

    joinedAt: timestamp("joined_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "fk_home_members_home",
      columns: [table.homeId],
      foreignColumns: [homes.id],
    }).onDelete("cascade"),

    foreignKey({
      name: "fk_home_members_user",
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),

    check(
      "home_members_role_check",
      sql`${table.role} IN ('member', 'admin')`,
    ),

    unique("uq_home_members_home_user").on(
      table.homeId,
      table.userId,
    ),

    index("idx_home_members_home_id").on(table.homeId),
    index("idx_home_members_user_id").on(table.userId),
  ],
);
