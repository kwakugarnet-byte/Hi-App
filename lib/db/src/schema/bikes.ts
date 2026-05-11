import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { staffTable } from "./staff";

export const bikeStatuses = ["available", "rented", "maintenance"] as const;
export type BikeStatus = (typeof bikeStatuses)[number];

export const bikesTable = pgTable("bikes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  registration: text("registration"),
  riderName: text("rider_name"),
  color: text("color"),
  status: text("status").notNull().default("available"),
  weeklyTargetPesewas: integer("weekly_target_pesewas").notNull().default(25000),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bikeIncomeTable = pgTable("bike_income", {
  id: serial("id").primaryKey(),
  bikeId: integer("bike_id").notNull().references(() => bikesTable.id, { onDelete: "cascade" }),
  amountPesewas: integer("amount_pesewas").notNull(),
  weekStart: text("week_start").notNull(),
  note: text("note"),
  deposited: boolean("deposited").notNull().default(false),
  depositedAt: timestamp("deposited_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bikeExpensesTable = pgTable("bike_expenses", {
  id: serial("id").primaryKey(),
  bikeId: integer("bike_id").notNull().references(() => bikesTable.id, { onDelete: "cascade" }),
  amountPesewas: integer("amount_pesewas").notNull(),
  category: text("category").notNull().default("other"),
  description: text("description").notNull(),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bikeAssignmentsTable = pgTable("bike_assignments", {
  id: serial("id").primaryKey(),
  bikeId: integer("bike_id").notNull().references(() => bikesTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  canEditDetails: boolean("can_edit_details").notNull().default(false),
  canEditPrice: boolean("can_edit_price").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Bike = typeof bikesTable.$inferSelect;
export type InsertBike = typeof bikesTable.$inferInsert;
export type BikeIncome = typeof bikeIncomeTable.$inferSelect;
export type BikeExpense = typeof bikeExpensesTable.$inferSelect;
export type BikeAssignment = typeof bikeAssignmentsTable.$inferSelect;
