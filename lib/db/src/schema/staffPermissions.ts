import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { staffTable } from "./staff";

export const staffPermissionsTable = pgTable("staff_permissions", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniq: unique().on(t.staffId, t.permission),
}));

export type StaffPermission = typeof staffPermissionsTable.$inferSelect;

export const ALL_PERMISSIONS = [
  { key: "manage_products",   label: "Add & edit products",       group: "Products" },
  { key: "change_prices",     label: "Change product prices",     group: "Products" },
  { key: "delete_products",   label: "Delete products",           group: "Products" },
  { key: "manage_categories", label: "Manage menu categories",    group: "Menu" },
  { key: "manage_staff",      label: "Manage staff accounts",     group: "Staff" },
  { key: "view_activity",     label: "View activity log",         group: "Reports" },
  { key: "access_bikes",      label: "Access bike management",    group: "Bikes" },
] as const;

export type PermissionKey = (typeof ALL_PERMISSIONS)[number]["key"];
