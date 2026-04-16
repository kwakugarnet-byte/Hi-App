import { pgTable, serial, integer, timestamp, varchar } from "drizzle-orm/pg-core";
import { staffTable } from "./staff";

export const shiftsTable = pgTable("shifts", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  staffName: varchar("staff_name", { length: 100 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type Shift = typeof shiftsTable.$inferSelect;
export type InsertShift = typeof shiftsTable.$inferInsert;
