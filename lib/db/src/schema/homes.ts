import {
  bigint,
  varchar,
  timestamp,
  index,
  pgTable,
  foreignKey,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const homes = pgTable(
  "homes",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),

    name: varchar("name", { length: 100 }).notNull(),

    ownerUserId: bigint("owner_user_id", { mode: "number" }).notNull(),

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
      name: "fk_homes_owner",
      columns: [table.ownerUserId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),

    index("idx_homes_owner_user_id").on(table.ownerUserId),
  ],
);
