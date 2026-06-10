import { pgTable, serial, integer, varchar, timestamp, text } from "drizzle-orm/pg-core";
import { staffTable } from "./staff";

export const CHARGE_TYPES = ["breakage", "damage", "cash_advance", "credit", "other"] as const;
export type ChargeType = (typeof CHARGE_TYPES)[number];

export const staffChargesTable = pgTable("staff_charges", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  staffName: varchar("staff_name", { length: 100 }).notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  amountPence: integer("amount_pence").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
  clearedBy: varchar("cleared_by", { length: 100 }),
});

export type StaffCharge = typeof staffChargesTable.$inferSelect;
export type InsertStaffCharge = typeof staffChargesTable.$inferInsert;
