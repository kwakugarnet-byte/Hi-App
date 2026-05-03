import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const partialPaymentsTable = pgTable("partial_payments", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  waitressName: text("waitress_name").notNull(),
  amountPence: integer("amount_pence").notNull(),
  recordedBy: text("recorded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PartialPayment = typeof partialPaymentsTable.$inferSelect;
