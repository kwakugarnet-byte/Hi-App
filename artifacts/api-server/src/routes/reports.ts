import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { db, menuItemsTable, orderBatchesTable, orderItemsTable, staffTable } from "@workspace/db";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function parseTimeHHMM(s: string | undefined): { h: number; m: number } | null {
  if (!s) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function inTimeWindow(date: Date, fromHH: { h: number; m: number }, toHH: { h: number; m: number }): boolean {
  const totalMins = date.getHours() * 60 + date.getMinutes();
  const fromMins = fromHH.h * 60 + fromHH.m;
  const toMins = toHH.h * 60 + toHH.m;
  if (fromMins <= toMins) {
    return totalMins >= fromMins && totalMins < toMins;
  }
  // wraps midnight (e.g. 22:00 - 06:00)
  return totalMins >= fromMins || totalMins < toMins;
}

// GET /reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&category=<name>&waiter=<name>&timeFrom=HH:MM&timeTo=HH:MM
router.get("/reports/sales", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { from, to, category, waiter, timeFrom, timeTo } = req.query as Record<string, string | undefined>;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const fromDate = from ? new Date(from + "T00:00:00") : startOfToday;
  const toDate = to ? new Date(to + "T23:59:59") : endOfToday;

  const parsedTimeFrom = parseTimeHHMM(timeFrom);
  const parsedTimeTo = parseTimeHHMM(timeTo);
  const hasTimeFilter = parsedTimeFrom !== null && parsedTimeTo !== null;

  const batchConditions = [
    gte(orderBatchesTable.createdAt, fromDate),
    lte(orderBatchesTable.createdAt, toDate),
    inArray(orderBatchesTable.status, ["completed", "paid"]),
  ];

  let batchesRaw = await db
    .select({ id: orderBatchesTable.id, createdAt: orderBatchesTable.createdAt, waitressName: orderBatchesTable.waitressName })
    .from(orderBatchesTable)
    .where(and(...batchConditions));

  // Apply waiter filter
  if (waiter) {
    batchesRaw = batchesRaw.filter((b) => b.waitressName === waiter);
  }

  // Apply time-of-day filter
  if (hasTimeFilter) {
    batchesRaw = batchesRaw.filter((b) => inTimeWindow(b.createdAt, parsedTimeFrom!, parsedTimeTo!));
  }

  if (batchesRaw.length === 0) {
    res.set("Cache-Control", "no-store");
    res.json({
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      totalOrders: 0,
      totalItemsSold: 0,
      totalRevenuePence: 0,
      items: [],
      byDay: [],
      byWaiter: [],
    });
    return;
  }

  const batchIds = batchesRaw.map((b) => b.id);
  const batchDateMap = new Map(batchesRaw.map((b) => [b.id, b.createdAt]));
  const batchWaiterMap = new Map(batchesRaw.map((b) => [b.id, b.waitressName]));

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

  const filtered = category ? rows.filter((r) => r.category === category) : rows;

  const usedBatchIds = new Set(filtered.map((r) => r.batchId));

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

  // Aggregate per waiter
  const waiterMap = new Map<string, { orders: Set<number>; qty: number; revenuePence: number }>();
  for (const row of filtered) {
    const name = batchWaiterMap.get(row.batchId) ?? "Unknown";
    const existing = waiterMap.get(name);
    if (existing) {
      existing.orders.add(row.batchId);
      existing.qty += row.quantity;
      existing.revenuePence += row.pricePence * row.quantity;
    } else {
      waiterMap.set(name, { orders: new Set([row.batchId]), qty: row.quantity, revenuePence: row.pricePence * row.quantity });
    }
  }
  const byWaiter = [...waiterMap.entries()]
    .map(([name, d]) => ({ name, orders: d.orders.size, qty: d.qty, revenuePence: d.revenuePence }))
    .sort((a, b) => b.revenuePence - a.revenuePence);

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
    byWaiter,
  });
});

// GET /reports/sales/categories
router.get("/reports/sales/categories", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({ category: menuItemsTable.category })
    .from(menuItemsTable)
    .orderBy(menuItemsTable.category);
  const cats = [...new Set(rows.map((r) => r.category))];
  res.set("Cache-Control", "no-store");
  res.json(cats);
});

// GET /reports/sales/waiters — all staff who can take orders
router.get("/reports/sales/waiters", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({ id: staffTable.id, name: staffTable.name, role: staffTable.role })
    .from(staffTable)
    .orderBy(staffTable.name);
  res.set("Cache-Control", "no-store");
  res.json(rows);
});

export default router;
