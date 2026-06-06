import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, bikesTable, bikeIncomeTable, bikeExpensesTable, bikeAssignmentsTable, staffTable, staffPermissionsTable } from "@workspace/db";

const router: IRouter = Router();

async function requireBikeAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user as { role?: string; id?: string } | undefined;
  if (!req.isAuthenticated() || !user) { res.status(403).json({ error: "Access denied" }); return; }
  if (user.role === "admin" || user.role === "bike_manager") { next(); return; }
  const staffId = parseInt(user.id ?? "", 10);
  if (!isNaN(staffId)) {
    const [perm] = await db
      .select()
      .from(staffPermissionsTable)
      .where(and(eq(staffPermissionsTable.staffId, staffId), eq(staffPermissionsTable.permission, "access_bikes")));
    if (perm) { next(); return; }
  }
  res.status(403).json({ error: "Access denied" });
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as { role?: string } | undefined;
  if (!req.isAuthenticated() || user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

function serializeBike(b: typeof bikesTable.$inferSelect) {
  return { ...b, createdAt: b.createdAt.toISOString() };
}

function serializeIncome(i: typeof bikeIncomeTable.$inferSelect) {
  return { ...i, depositedAt: i.depositedAt?.toISOString() ?? null, createdAt: i.createdAt.toISOString() };
}

function serializeExpense(e: typeof bikeExpensesTable.$inferSelect) {
  return { ...e, createdAt: e.createdAt.toISOString() };
}

// ─── Bikes CRUD ─────────────────────────────────────────────────────────────

// GET /api/bikes
router.get("/bikes", requireBikeAccess, async (_req: Request, res: Response): Promise<void> => {
  const bikes = await db.select().from(bikesTable).orderBy(bikesTable.createdAt);
  res.json(bikes.map(serializeBike));
});

// GET /api/bikes/staff — staff list for assignment dropdown
router.get("/bikes/staff", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const staff = await db.select({ id: staffTable.id, name: staffTable.name, role: staffTable.role }).from(staffTable).orderBy(staffTable.name);
  res.json(staff);
});

// GET /api/bikes/:id
router.get("/bikes/:id", requireBikeAccess, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [bike] = await db.select().from(bikesTable).where(eq(bikesTable.id, id));
  if (!bike) { res.status(404).json({ error: "Bike not found" }); return; }
  res.json(serializeBike(bike));
});

// POST /api/bikes
router.post("/bikes", requireBikeAccess, async (req: Request, res: Response): Promise<void> => {
  const { name, registration, riderName, color, notes, weeklyTargetPesewas } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const target = typeof weeklyTargetPesewas === "number" ? weeklyTargetPesewas : 25000;
  const [bike] = await db
    .insert(bikesTable)
    .values({
      name: name.trim(),
      registration: registration?.trim() || null,
      riderName: riderName?.trim() || null,
      color: color?.trim() || null,
      notes: notes?.trim() || null,
      weeklyTargetPesewas: target,
      status: "available",
    })
    .returning();
  res.status(201).json(serializeBike(bike));
});

// PATCH /api/bikes/:id
router.patch("/bikes/:id", requireBikeAccess, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, name, registration, riderName, color, notes, weeklyTargetPesewas } = req.body;
  const validStatuses = ["available", "rented", "maintenance"];
  const updates: Record<string, unknown> = {};
  if (name && typeof name === "string" && name.trim()) updates.name = name.trim();
  if (typeof registration === "string") updates.registration = registration.trim() || null;
  if (typeof riderName === "string") updates.riderName = riderName.trim() || null;
  if (typeof color === "string") updates.color = color.trim() || null;
  if (typeof notes === "string") updates.notes = notes.trim() || null;
  if (status && validStatuses.includes(status)) updates.status = status;
  if (typeof weeklyTargetPesewas === "number" && weeklyTargetPesewas > 0) updates.weeklyTargetPesewas = weeklyTargetPesewas;
  if (!Object.keys(updates).length) { res.status(400).json({ error: "Nothing to update" }); return; }
  const [bike] = await db.update(bikesTable).set(updates).where(eq(bikesTable.id, id)).returning();
  if (!bike) { res.status(404).json({ error: "Bike not found" }); return; }
  res.json(serializeBike(bike));
});

// DELETE /api/bikes/:id
router.delete("/bikes/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [bike] = await db.select().from(bikesTable).where(eq(bikesTable.id, id));
  if (!bike) { res.status(404).json({ error: "Bike not found" }); return; }
  await db.delete(bikesTable).where(eq(bikesTable.id, id));
  res.status(204).send();
});

// ─── Income ──────────────────────────────────────────────────────────────────

// GET /api/bikes/:bikeId/income
router.get("/bikes/:bikeId/income", requireBikeAccess, async (req: Request, res: Response): Promise<void> => {
  const bikeId = parseInt(req.params.bikeId as string, 10);
  if (isNaN(bikeId)) { res.status(400).json({ error: "Invalid bikeId" }); return; }
  const rows = await db.select().from(bikeIncomeTable)
    .where(eq(bikeIncomeTable.bikeId, bikeId))
    .orderBy(desc(bikeIncomeTable.weekStart));
  res.json(rows.map(serializeIncome));
});

// POST /api/bikes/:bikeId/income
router.post("/bikes/:bikeId/income", requireBikeAccess, async (req: Request, res: Response): Promise<void> => {
  const bikeId = parseInt(req.params.bikeId as string, 10);
  if (isNaN(bikeId)) { res.status(400).json({ error: "Invalid bikeId" }); return; }
  const { amountPesewas, weekStart, note } = req.body;
  if (typeof amountPesewas !== "number" || amountPesewas <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }
  if (!weekStart || typeof weekStart !== "string") { res.status(400).json({ error: "weekStart required (YYYY-MM-DD)" }); return; }
  const [row] = await db.insert(bikeIncomeTable).values({ bikeId, amountPesewas, weekStart, note: note?.trim() || null }).returning();
  res.status(201).json(serializeIncome(row));
});

// PATCH /api/bikes/income/:id/deposit
router.patch("/bikes/income/:id/deposit", requireBikeAccess, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.update(bikeIncomeTable)
    .set({ deposited: true, depositedAt: new Date() })
    .where(and(eq(bikeIncomeTable.id, id), eq(bikeIncomeTable.deposited, false)))
    .returning();
  if (!row) { res.status(404).json({ error: "Entry not found or already deposited" }); return; }
  res.json(serializeIncome(row));
});

// DELETE /api/bikes/income/:id
router.delete("/bikes/income/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(bikeIncomeTable).where(eq(bikeIncomeTable.id, id));
  res.status(204).send();
});

// ─── Expenses ─────────────────────────────────────────────────────────────────

// GET /api/bikes/:bikeId/expenses
router.get("/bikes/:bikeId/expenses", requireBikeAccess, async (req: Request, res: Response): Promise<void> => {
  const bikeId = parseInt(req.params.bikeId as string, 10);
  if (isNaN(bikeId)) { res.status(400).json({ error: "Invalid bikeId" }); return; }
  const rows = await db.select().from(bikeExpensesTable)
    .where(eq(bikeExpensesTable.bikeId, bikeId))
    .orderBy(desc(bikeExpensesTable.date));
  res.json(rows.map(serializeExpense));
});

// POST /api/bikes/:bikeId/expenses
router.post("/bikes/:bikeId/expenses", requireBikeAccess, async (req: Request, res: Response): Promise<void> => {
  const bikeId = parseInt(req.params.bikeId as string, 10);
  if (isNaN(bikeId)) { res.status(400).json({ error: "Invalid bikeId" }); return; }
  const { amountPesewas, category, description, date } = req.body;
  if (typeof amountPesewas !== "number" || amountPesewas <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }
  if (!description || typeof description !== "string" || !description.trim()) { res.status(400).json({ error: "Description required" }); return; }
  if (!date || typeof date !== "string") { res.status(400).json({ error: "Date required (YYYY-MM-DD)" }); return; }
  const validCategories = ["maintenance", "fuel", "other"];
  const cat = validCategories.includes(category) ? category : "other";
  const [row] = await db.insert(bikeExpensesTable).values({ bikeId, amountPesewas, category: cat, description: description.trim(), date }).returning();
  res.status(201).json(serializeExpense(row));
});

// DELETE /api/bikes/expenses/:id
router.delete("/bikes/expenses/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(bikeExpensesTable).where(eq(bikeExpensesTable.id, id));
  res.status(204).send();
});

// ─── Assignments ──────────────────────────────────────────────────────────────

// GET /api/bikes/:bikeId/assignments
router.get("/bikes/:bikeId/assignments", requireBikeAccess, async (req: Request, res: Response): Promise<void> => {
  const bikeId = parseInt(req.params.bikeId as string, 10);
  if (isNaN(bikeId)) { res.status(400).json({ error: "Invalid bikeId" }); return; }
  const rows = await db
    .select({
      id: bikeAssignmentsTable.id,
      bikeId: bikeAssignmentsTable.bikeId,
      staffId: bikeAssignmentsTable.staffId,
      staffName: staffTable.name,
      staffRole: staffTable.role,
      canEditDetails: bikeAssignmentsTable.canEditDetails,
      canEditPrice: bikeAssignmentsTable.canEditPrice,
      createdAt: bikeAssignmentsTable.createdAt,
    })
    .from(bikeAssignmentsTable)
    .leftJoin(staffTable, eq(bikeAssignmentsTable.staffId, staffTable.id))
    .where(eq(bikeAssignmentsTable.bikeId, bikeId));
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// POST /api/bikes/:bikeId/assignments
router.post("/bikes/:bikeId/assignments", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const bikeId = parseInt(req.params.bikeId as string, 10);
  if (isNaN(bikeId)) { res.status(400).json({ error: "Invalid bikeId" }); return; }
  const { staffId, canEditDetails, canEditPrice } = req.body;
  if (typeof staffId !== "number") { res.status(400).json({ error: "staffId required" }); return; }
  const [row] = await db.insert(bikeAssignmentsTable).values({
    bikeId, staffId,
    canEditDetails: !!canEditDetails,
    canEditPrice: !!canEditPrice,
  }).returning();
  const [staff] = await db.select({ id: staffTable.id, name: staffTable.name, role: staffTable.role }).from(staffTable).where(eq(staffTable.id, staffId));
  res.status(201).json({ ...row, staffName: staff?.name ?? null, staffRole: staff?.role ?? null, createdAt: row.createdAt.toISOString() });
});

// PATCH /api/bikes/assignments/:id
router.patch("/bikes/assignments/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { canEditDetails, canEditPrice } = req.body;
  const updates: Record<string, unknown> = {};
  if (typeof canEditDetails === "boolean") updates.canEditDetails = canEditDetails;
  if (typeof canEditPrice === "boolean") updates.canEditPrice = canEditPrice;
  if (!Object.keys(updates).length) { res.status(400).json({ error: "Nothing to update" }); return; }
  const [row] = await db.update(bikeAssignmentsTable).set(updates).where(eq(bikeAssignmentsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

// DELETE /api/bikes/assignments/:id
router.delete("/bikes/assignments/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(bikeAssignmentsTable).where(eq(bikeAssignmentsTable.id, id));
  res.status(204).send();
});

export default router;
