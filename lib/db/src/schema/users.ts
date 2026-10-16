import {
  bigint,
  varchar,
  text,
  timestamp,
  index,
  check,
  pgTable,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),

    email: varchar("email", { length: 255 }).notNull().unique(),

    passwordHash: text("password_hash").notNull(),

    displayName: varchar("display_name", { length: 100 }).notNull(),

    accountStatus: varchar("account_status", { length: 20 })
      .notNull()
      .default("active"),

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
    check(
      "users_account_status_check",
      sql`${table.accountStatus} IN ('active', 'locked', 'disabled')`,
    ),
    index("idx_users_account_status").on(table.accountStatus),
  ],
);
