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

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as { role?: string } | undefined;
  if (!req.isAuthenticated() || user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
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

  res.json(item);
});

router.delete("/menu-items/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(menuItemsTable).where(eq(menuItemsTable.id, id));
  res.status(204).send();
});

router.get("/admin/staff", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const staff = await db
    .select({ id: staffTable.id, name: staffTable.name, role: staffTable.role })
    .from(staffTable)
    .orderBy(staffTable.name);
  res.json(staff);
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
    .values({ name: parsed.data.name, pinHash, role: parsed.data.role })
    .returning({ id: staffTable.id, name: staffTable.name, role: staffTable.role });

  res.status(201).json(member);
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

  const [member] = await db
    .update(staffTable)
    .set(update)
    .where(eq(staffTable.id, id))
    .returning({ id: staffTable.id, name: staffTable.name, role: staffTable.role });

  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }

  res.json(member);
});

router.delete("/admin/staff/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(staffTable).where(eq(staffTable.id, id));
  res.status(204).send();
});

export default router;
