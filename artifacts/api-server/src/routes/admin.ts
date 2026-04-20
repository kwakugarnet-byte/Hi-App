import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, menuItemsTable, staffTable } from "@workspace/db";
import {
  CreateMenuItemBody,
  UpdateMenuItemBody,
  CreateStaffBody,
  UpdateStaffBody,
} from "@workspace/api-zod";
import { logActivity } from "../lib/logActivity";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as { role?: string } | undefined;
  if (!req.isAuthenticated() || user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

function adminActor(req: Request): string {
  const u = req.user as { firstName?: string; lastName?: string } | undefined;
  return u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || "admin" : "admin";
}

router.post("/menu-items", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateMenuItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .insert(menuItemsTable)
    .values(parsed.data)
    .returning();

  await logActivity(adminActor(req), "admin", "menu_item_created", {
    itemId: item.id,
    name: item.name,
    category: item.category,
    pricePence: item.pricePence,
  });

  res.status(201).json(item);
});

router.patch("/menu-items/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = UpdateMenuItemBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .update(menuItemsTable)
    .set(parsed.data)
    .where(eq(menuItemsTable.id, id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  await logActivity(adminActor(req), "admin", "menu_item_updated", {
    itemId: id,
    changes: parsed.data,
  });

  res.json(item);
});

router.delete("/menu-items/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [item] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.id, id));
  await db.delete(menuItemsTable).where(eq(menuItemsTable.id, id));

  await logActivity(adminActor(req), "admin", "menu_item_deleted", {
    itemId: id,
    name: item?.name,
  });

  res.status(204).send();
});

router.get("/admin/staff", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const staff = await db
    .select({ id: staffTable.id, name: staffTable.name, role: staffTable.role, bonusPercent: staffTable.bonusPercent, bonusLastPaidAt: staffTable.bonusLastPaidAt })
    .from(staffTable)
    .orderBy(staffTable.name);
  res.json(staff.map((s) => ({ ...s, bonusLastPaidAt: s.bonusLastPaidAt?.toISOString() ?? null })));
});

router.post("/admin/staff", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const pinHash = await bcrypt.hash(parsed.data.pin, 10);

  const [member] = await db
    .insert(staffTable)
    .values({ name: parsed.data.name, pinHash, role: parsed.data.role, bonusPercent: parsed.data.bonusPercent ?? 0 })
    .returning({ id: staffTable.id, name: staffTable.name, role: staffTable.role, bonusPercent: staffTable.bonusPercent, bonusLastPaidAt: staffTable.bonusLastPaidAt });

  await logActivity(adminActor(req), "admin", "staff_created", {
    staffId: member.id,
    name: member.name,
    role: member.role,
  });

  res.status(201).json({ ...member, bonusLastPaidAt: member.bonusLastPaidAt?.toISOString() ?? null });
});

router.patch("/admin/staff/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = UpdateStaffBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.role !== undefined) update.role = parsed.data.role;
  if (parsed.data.pin !== undefined) update.pinHash = await bcrypt.hash(parsed.data.pin, 10);
  if (parsed.data.bonusPercent !== undefined) update.bonusPercent = parsed.data.bonusPercent;

  const [member] = await db
    .update(staffTable)
    .set(update)
    .where(eq(staffTable.id, id))
    .returning({ id: staffTable.id, name: staffTable.name, role: staffTable.role, bonusPercent: staffTable.bonusPercent, bonusLastPaidAt: staffTable.bonusLastPaidAt });

  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }

  const changes: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) changes.name = parsed.data.name;
  if (parsed.data.role !== undefined) changes.role = parsed.data.role;
  if (parsed.data.pin !== undefined) changes.pinChanged = true;

  await logActivity(adminActor(req), "admin", "staff_updated", {
    staffId: id,
    name: member.name,
    changes,
  });

  res.json({ ...member, bonusLastPaidAt: member.bonusLastPaidAt?.toISOString() ?? null });
});

router.post("/admin/staff/:id/clear-bonus", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const now = new Date();
  const [member] = await db
    .update(staffTable)
    .set({ bonusLastPaidAt: now })
    .where(eq(staffTable.id, id))
    .returning({ id: staffTable.id, name: staffTable.name, role: staffTable.role, bonusPercent: staffTable.bonusPercent, bonusLastPaidAt: staffTable.bonusLastPaidAt });

  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }

  await logActivity(adminActor(req), "admin", "bonus_cleared", {
    staffId: id,
    name: member.name,
    clearedAt: now.toISOString(),
  });

  res.json({ ...member, bonusLastPaidAt: member.bonusLastPaidAt?.toISOString() ?? null });
});

router.delete("/admin/staff/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [member] = await db.select({ id: staffTable.id, name: staffTable.name, role: staffTable.role }).from(staffTable).where(eq(staffTable.id, id));
  await db.delete(staffTable).where(eq(staffTable.id, id));

  await logActivity(adminActor(req), "admin", "staff_deleted", {
    staffId: id,
    name: member?.name,
    role: member?.role,
  });

  res.status(204).send();
});

export default router;
