
import {
  json,
  varchar,
  timestamp,
  index,
  pgTable,
} from "drizzle-orm/pg-core";

export const sessions = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", {
      withTimezone: false,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    index("IDX_session_expire").on(table.expire),
  ],
);
