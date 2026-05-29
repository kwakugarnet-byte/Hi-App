import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, menuItemsTable, staffTable, categoriesTable, staffPermissionsTable } from "@workspace/db";
import { CreateMenuItemBody, CreateStaffBody, UpdateStaffBody } from "@workspace/api-zod";
import { logActivity } from "../lib/logActivity";

const router: IRouter = Router();

// ─── Permission helpers ───────────────────────────────────────────────────────

async function getUserPerms(req: Request): Promise<Set<string>> {
  const user = req.user as { role?: string; id?: string } | undefined;
  if (!req.isAuthenticated() || !user) return new Set();
  if (user.role === "admin") return new Set(["*"]);
  const staffId = parseInt(user.id ?? "", 10);
  if (isNaN(staffId)) return new Set();
  const rows = await db
    .select({ permission: staffPermissionsTable.permission })
    .from(staffPermissionsTable)
    .where(eq(staffPermissionsTable.staffId, staffId));
  return new Set(rows.map((r) => r.permission));
}

function hasAny(perms: Set<string>, ...keys: string[]): boolean {
  return perms.has("*") || keys.some((k) => perms.has(k));
}

function requirePermission(...permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
    const perms = await getUserPerms(req);
    if (hasAny(perms, ...permissions)) { next(); return; }
    res.status(403).json({ error: "Access denied" });
  };
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as { role?: string } | undefined;
  if (!req.isAuthenticated() || user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

function actor(req: Request): string {
  const u = req.user as { firstName?: string; lastName?: string } | undefined;
  return u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || "staff" : "staff";
}

// ─── Categories ───────────────────────────────────────────────────────────────

router.get("/categories", async (_req: Request, res: Response): Promise<void> => {
  const cats = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
  res.json(cats);
});

router.post("/categories", requirePermission("manage_categories"), async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) { res.status(400).json({ error: "Name is required" }); return; }
  try {
    const [cat] = await db.insert(categoriesTable).values({ name: name.trim() }).returning();
    await logActivity(actor(req), "staff", "category_created", { name: cat.name });
    res.status(201).json(cat);
  } catch { res.status(409).json({ error: "Category already exists" }); }
});

router.delete("/categories/:id", requirePermission("manage_categories"), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, id));
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
  await logActivity(actor(req), "staff", "category_deleted", { name: cat.name });
  res.status(204).send();
});

// ─── Menu Items ───────────────────────────────────────────────────────────────

router.post("/menu-items", requirePermission("manage_products"), async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateMenuItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [item] = await db.insert(menuItemsTable).values(parsed.data).returning();
  await logActivity(actor(req), "staff", "menu_item_created", { itemId: item.id, name: item.name, pricePence: item.pricePence });
  res.status(201).json(item);
});

// PATCH: manage_products = can edit name/category; change_prices = can edit price; admin = all
router.patch("/menu-items/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const perms = await getUserPerms(req);
  const canManage = hasAny(perms, "manage_products");
  const canPrice = hasAny(perms, "change_prices");
  if (!canManage && !canPrice) { res.status(403).json({ error: "Access denied" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, category, pricePence, barcode, sku } = req.body;
  const updates: Record<string, unknown> = {};
  if (canManage) {
    if (name !== undefined && typeof name === "string" && name.trim()) updates.name = name.trim();
    if (category !== undefined && typeof category === "string" && category.trim()) updates.category = category.trim();
    if (barcode !== undefined) updates.barcode = barcode === "" ? null : String(barcode);
    if (sku !== undefined) updates.sku = sku === "" ? null : String(sku);
  }
  if (canPrice && pricePence !== undefined) {
    const p = Number(pricePence);
    if (!isNaN(p) && p >= 0) updates.pricePence = Math.round(p);
  }
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  const [item] = await db.update(menuItemsTable).set(updates).where(eq(menuItemsTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  await logActivity(actor(req), "staff", "menu_item_updated", { itemId: id, changes: updates });
  res.json(item);
});

router.delete("/menu-items/:id", requirePermission("delete_products"), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [item] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.id, id));
  await db.delete(menuItemsTable).where(eq(menuItemsTable.id, id));
  await logActivity(actor(req), "staff", "menu_item_deleted", { itemId: id, name: item?.name });
  res.status(204).send();
});

// ─── Staff ────────────────────────────────────────────────────────────────────

router.get("/admin/staff", requirePermission("manage_staff"), async (_req: Request, res: Response): Promise<void> => {
  const staff = await db
    .select({ id: staffTable.id, name: staffTable.name, role: staffTable.role, bonusPercent: staffTable.bonusPercent, bonusLastPaidAt: staffTable.bonusLastPaidAt })
    .from(staffTable).orderBy(staffTable.name);
  res.json(staff.map((s) => ({ ...s, bonusLastPaidAt: s.bonusLastPaidAt?.toISOString() ?? null })));
});

router.post("/admin/staff", requirePermission("manage_staff"), async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const pinHash = await bcrypt.hash(parsed.data.pin, 10);
  const [member] = await db
    .insert(staffTable)
    .values({ name: parsed.data.name, pinHash, role: parsed.data.role, bonusPercent: parsed.data.bonusPercent ?? 0 })
    .returning({ id: staffTable.id, name: staffTable.name, role: staffTable.role, bonusPercent: staffTable.bonusPercent, bonusLastPaidAt: staffTable.bonusLastPaidAt });
  await logActivity(actor(req), "staff", "staff_created", { staffId: member.id, name: member.name, role: member.role });
  res.status(201).json({ ...member, bonusLastPaidAt: member.bonusLastPaidAt?.toISOString() ?? null });
});

router.patch("/admin/staff/:id", requirePermission("manage_staff"), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateStaffBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.role !== undefined) update.role = parsed.data.role;
  if (parsed.data.pin !== undefined) update.pinHash = await bcrypt.hash(parsed.data.pin, 10);
  if (parsed.data.bonusPercent !== undefined) update.bonusPercent = parsed.data.bonusPercent;
  const [member] = await db
    .update(staffTable).set(update).where(eq(staffTable.id, id))
    .returning({ id: staffTable.id, name: staffTable.name, role: staffTable.role, bonusPercent: staffTable.bonusPercent, bonusLastPaidAt: staffTable.bonusLastPaidAt });
  if (!member) { res.status(404).json({ error: "Staff member not found" }); return; }
  await logActivity(actor(req), "staff", "staff_updated", { staffId: id, name: member.name });
  res.json({ ...member, bonusLastPaidAt: member.bonusLastPaidAt?.toISOString() ?? null });
});

router.post("/admin/staff/:id/clear-bonus", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const now = new Date();
  const [member] = await db
    .update(staffTable).set({ bonusLastPaidAt: now }).where(eq(staffTable.id, id))
    .returning({ id: staffTable.id, name: staffTable.name, role: staffTable.role, bonusPercent: staffTable.bonusPercent, bonusLastPaidAt: staffTable.bonusLastPaidAt });
  if (!member) { res.status(404).json({ error: "Staff member not found" }); return; }
  await logActivity(actor(req), "admin", "bonus_cleared", { staffId: id, name: member.name, clearedAt: now.toISOString() });
  res.json({ ...member, bonusLastPaidAt: member.bonusLastPaidAt?.toISOString() ?? null });
});

router.delete("/admin/staff/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [member] = await db.select({ id: staffTable.id, name: staffTable.name, role: staffTable.role }).from(staffTable).where(eq(staffTable.id, id));
  await db.delete(staffTable).where(eq(staffTable.id, id));
  await logActivity(actor(req), "admin", "staff_deleted", { staffId: id, name: member?.name, role: member?.role });
  res.status(204).send();
});

// ─── Staff Permissions management (admin only) ────────────────────────────────

router.get("/admin/staff/:id/permissions", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db
    .select({ permission: staffPermissionsTable.permission })
    .from(staffPermissionsTable)
    .where(eq(staffPermissionsTable.staffId, id));
  res.json({ permissions: rows.map((r) => r.permission) });
});

router.post("/admin/staff/:id/permissions", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { permission } = req.body;
  if (!permission || typeof permission !== "string") { res.status(400).json({ error: "permission required" }); return; }
  await db.insert(staffPermissionsTable).values({ staffId: id, permission }).onConflictDoNothing();
  res.status(204).send();
});

router.delete("/admin/staff/:id/permissions/:permission", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(staffPermissionsTable)
    .where(and(eq(staffPermissionsTable.staffId, id), eq(staffPermissionsTable.permission, req.params.permission)));
  res.status(204).send();
});

export default router;
