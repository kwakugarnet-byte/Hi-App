import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { db, menuItemsTable, orderBatchesTable, orderItemsTable } from "@workspace/db";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// GET /reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&category=<name>
router.get("/reports/sales", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { from, to, category } = req.query as Record<string, string | undefined>;

  // Build date range — default to today
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const fromDate = from ? new Date(from + "T00:00:00") : startOfToday;
  const toDate = to ? new Date(to + "T23:59:59") : endOfToday;

  // Fetch batches in range (completed or paid — not pending/returned)
  const batchConditions = [
    gte(orderBatchesTable.createdAt, fromDate),
    lte(orderBatchesTable.createdAt, toDate),
    inArray(orderBatchesTable.status, ["completed", "paid"]),
  ];
  const batches = await db
    .select({ id: orderBatchesTable.id, createdAt: orderBatchesTable.createdAt })
    .from(orderBatchesTable)
    .where(and(...batchConditions));

  if (batches.length === 0) {
    res.set("Cache-Control", "no-store");
    res.json({
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      totalOrders: 0,
      totalItemsSold: 0,
      totalRevenuePence: 0,
      items: [],
      byDay: [],
    });
    return;
  }

  const batchIds = batches.map((b) => b.id);
  const batchDateMap = new Map(batches.map((b) => [b.id, b.createdAt]));

  // Fetch all order items for these batches joined with menu items
  const rows = await db
    .select({
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      quantity: orderItemsTable.quantity,
      name: menuItemsTable.name,
      category: menuItemsTable.category,
      pricePence: menuItemsTable.pricePence,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(inArray(orderItemsTable.batchId, batchIds));

  // Apply category filter
  const filtered = category ? rows.filter((r) => r.category === category) : rows;

  // Figure out which batch IDs actually appear in filtered rows (for totalOrders)
  const usedBatchIds = new Set(filtered.map((r) => r.batchId));

  // Aggregate per product
  const productMap = new Map<number, { name: string; category: string; qty: number; revenuePence: number }>();
  for (const row of filtered) {
    const existing = productMap.get(row.menuItemId);
    if (existing) {
      existing.qty += row.quantity;
      existing.revenuePence += row.pricePence * row.quantity;
    } else {
      productMap.set(row.menuItemId, {
        name: row.name,
        category: row.category,
        qty: row.quantity,
        revenuePence: row.pricePence * row.quantity,
      });
    }
  }

  const items = [...productMap.values()].sort((a, b) => b.qty - a.qty);

  // Aggregate per day
  const dayMap = new Map<string, { qty: number; revenuePence: number; orders: Set<number> }>();
  for (const row of filtered) {
    const batchDate = batchDateMap.get(row.batchId);
    if (!batchDate) continue;
    const dayKey = batchDate.toISOString().slice(0, 10);
    const existing = dayMap.get(dayKey);
    if (existing) {
      existing.qty += row.quantity;
      existing.revenuePence += row.pricePence * row.quantity;
      existing.orders.add(row.batchId);
    } else {
      dayMap.set(dayKey, {
        qty: row.quantity,
        revenuePence: row.pricePence * row.quantity,
        orders: new Set([row.batchId]),
      });
    }
  }

  const byDay = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, qty: d.qty, revenuePence: d.revenuePence, orders: d.orders.size }));

  const totalItemsSold = items.reduce((s, i) => s + i.qty, 0);
  const totalRevenuePence = items.reduce((s, i) => s + i.revenuePence, 0);

  res.set("Cache-Control", "no-store");
  res.json({
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
    totalOrders: usedBatchIds.size,
    totalItemsSold,
    totalRevenuePence,
    items,
    byDay,
  });
});

// GET /reports/sales/categories — list all distinct categories that have sales
router.get("/reports/sales/categories", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({ category: menuItemsTable.category })
    .from(menuItemsTable)
    .orderBy(menuItemsTable.category);
  const cats = [...new Set(rows.map((r) => r.category))];
  res.set("Cache-Control", "no-store");
  res.json(cats);
});

export default router;
