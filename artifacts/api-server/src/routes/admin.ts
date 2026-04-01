import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, menuItemsTable } from "@workspace/db";
import { CreateMenuItemBody, UpdateMenuItemBody } from "@workspace/api-zod";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !(req.user as { isAdmin?: boolean }).isAdmin) {
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

export default router;
