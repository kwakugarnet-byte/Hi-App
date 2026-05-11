import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, bikesTable } from "@workspace/db";

const router: IRouter = Router();

function requireBikeAccess(req: Request, res: Response, next: NextFunction) {
  const user = req.user as { role?: string } | undefined;
  if (!req.isAuthenticated() || (user?.role !== "admin" && user?.role !== "bike_manager")) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as { role?: string } | undefined;
  if (!req.isAuthenticated() || user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// GET /bikes
router.get("/bikes", requireBikeAccess, async (_req: Request, res: Response): Promise<void> => {
  const bikes = await db.select().from(bikesTable).orderBy(bikesTable.createdAt);
  res.json(bikes.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() })));
});

// POST /bikes
router.post("/bikes", requireBikeAccess, async (req: Request, res: Response): Promise<void> => {
  const { name, notes } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const [bike] = await db
    .insert(bikesTable)
    .values({ name: name.trim(), notes: notes?.trim() || null, status: "available" })
    .returning();
  res.status(201).json({ ...bike, createdAt: bike.createdAt.toISOString() });
});

// PATCH /bikes/:id — update status and/or notes
router.patch("/bikes/:id", requireBikeAccess, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, notes, name } = req.body;
  const validStatuses = ["available", "rented", "maintenance"];
  const updates: Record<string, unknown> = {};
  if (name && typeof name === "string" && name.trim()) updates.name = name.trim();
  if (status && validStatuses.includes(status)) updates.status = status;
  if (typeof notes === "string") updates.notes = notes.trim() || null;
  if (!Object.keys(updates).length) { res.status(400).json({ error: "Nothing to update" }); return; }
  const [bike] = await db.update(bikesTable).set(updates).where(eq(bikesTable.id, id)).returning();
  if (!bike) { res.status(404).json({ error: "Bike not found" }); return; }
  res.json({ ...bike, createdAt: bike.createdAt.toISOString() });
});

// DELETE /bikes/:id — admin only
router.delete("/bikes/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [bike] = await db.select().from(bikesTable).where(eq(bikesTable.id, id));
  if (!bike) { res.status(404).json({ error: "Bike not found" }); return; }
  await db.delete(bikesTable).where(eq(bikesTable.id, id));
  res.status(204).send();
});

export default router;
