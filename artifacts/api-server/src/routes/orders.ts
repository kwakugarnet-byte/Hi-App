import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db, menuItemsTable, orderBatchesTable, orderItemsTable, shiftsTable, partialPaymentsTable, settingsTable } from "@workspace/db";
import {
  GetMenuItemsResponse,
  GetOrderBatchesResponse,
  CreateOrderBatchBody,
  CompleteOrderBatchParams,
  CompleteOrderBatchResponse,
  PayOrderBatchParams,
  PayOrderBatchResponse,
  SettleWaiterAccountBody,
  SettleWaiterAccountResponse,
  ReturnOrderBatchParams,
  ReturnOrderBatchBody,
  ReturnOrderBatchResponse,
  ResubmitOrderBatchParams,
  ResubmitOrderBatchBody,
  ResubmitOrderBatchResponse,
  EditOrderBatchBody,
} from "@workspace/api-zod";
import { logActivity } from "../lib/logActivity";

const router: IRouter = Router();

function actorFromReq(req: { user?: unknown }): { name: string; role: string } {
  const u = req.user as { firstName?: string; lastName?: string; role?: string } | undefined;
  const name = u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || "unknown" : "unknown";
  return { name, role: u?.role ?? "unknown" };
}

router.get("/menu-items", async (req, res): Promise<void> => {
  const items = await db.select().from(menuItemsTable).orderBy(menuItemsTable.category, menuItemsTable.name);
  res.json(GetMenuItemsResponse.parse(items));
});

async function getPriceMap(menuItemIds: number[]): Promise<Map<number, number>> {
  if (menuItemIds.length === 0) return new Map();
  const rows = await db
    .select({ id: menuItemsTable.id, pricePence: menuItemsTable.pricePence })
    .from(menuItemsTable)
    .where(inArray(menuItemsTable.id, [...new Set(menuItemIds)]));
  return new Map(rows.map((r) => [r.id, r.pricePence]));
}

const storedPrice = sql<number>`COALESCE(${orderItemsTable.pricePence}, ${menuItemsTable.pricePence})`;

router.get("/order-batches", async (req, res): Promise<void> => {
  const batches = await db.select().from(orderBatchesTable).orderBy(orderBatchesTable.createdAt);

  const allItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: storedPrice,
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id));

  const batchesWithItems = batches.map((batch) => ({
    ...batch,
    completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
    createdAt: batch.createdAt.toISOString(),
    items: allItems
      .filter((item) => item.batchId === batch.id)
      .map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        pricePence: item.pricePence,
        quantity: item.quantity,
      })),
  }));

  res.json(GetOrderBatchesResponse.parse(batchesWithItems));
});

router.post("/order-batches", async (req, res): Promise<void> => {
  const parsed = CreateOrderBatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { customerName, waitressName, items } = parsed.data;

  const [batch] = await db
    .insert(orderBatchesTable)
    .values({ customerName, waitressName, status: "pending" })
    .returning();

  if (items.length > 0) {
    const priceMap = await getPriceMap(items.map((i) => i.menuItemId));
    await db.insert(orderItemsTable).values(
      items.map((item) => ({
        batchId: batch.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        pricePence: priceMap.get(item.menuItemId),
      }))
    );
  }

  const orderItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: storedPrice,
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(eq(orderItemsTable.batchId, batch.id));

  const actor = actorFromReq(req);
  await logActivity(waitressName, actor.role, "order_placed", {
    batchId: batch.id,
    customerName,
    itemCount: items.length,
    items: orderItems.map((i) => `${i.menuItemName} x${i.quantity}`),
  });

  const result = {
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: null,
    items: orderItems.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      pricePence: item.pricePence,
      quantity: item.quantity,
    })),
  };

  res.status(201).json(result);
});

router.post("/order-batches/hold", async (req, res): Promise<void> => {
  const parsed = CreateOrderBatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { customerName, waitressName, items } = parsed.data;

  const [batch] = await db
    .insert(orderBatchesTable)
    .values({ customerName, waitressName, status: "on_hold", saleType: "bar" })
    .returning();

  if (items.length > 0) {
    const priceMap = await getPriceMap(items.map((i) => i.menuItemId));
    await db.insert(orderItemsTable).values(
      items.map((item) => ({ batchId: batch.id, menuItemId: item.menuItemId, quantity: item.quantity, pricePence: priceMap.get(item.menuItemId) }))
    );
  }

  const orderItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: storedPrice,
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(eq(orderItemsTable.batchId, batch.id));

  const actor = actorFromReq(req);
  const totalPence = orderItems.reduce((s, i) => s + i.pricePence * i.quantity, 0);
  await logActivity(actor.name, actor.role, "order_held", {
    batchId: batch.id,
    customerName,
    totalPence,
  });

  res.status(201).json({
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
    items: orderItems.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      pricePence: item.pricePence,
      quantity: item.quantity,
    })),
  });
});

router.post("/order-batches/direct", async (req, res): Promise<void> => {
  const parsed = CreateOrderBatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { customerName, waitressName, items } = parsed.data;

  const [batch] = await db
    .insert(orderBatchesTable)
    .values({ customerName, waitressName, status: "paid", saleType: "bar", completedAt: new Date() })
    .returning();

  if (items.length > 0) {
    const priceMap = await getPriceMap(items.map((i) => i.menuItemId));
    await db.insert(orderItemsTable).values(
      items.map((item) => ({
        batchId: batch.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        pricePence: priceMap.get(item.menuItemId),
      }))
    );
  }

  const orderItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: storedPrice,
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(eq(orderItemsTable.batchId, batch.id));

  const actor = actorFromReq(req);
  const totalPence = orderItems.reduce((s, i) => s + i.pricePence * i.quantity, 0);
  await logActivity(actor.name, actor.role, "order_direct", {
    batchId: batch.id,
    customerName,
    totalPence,
    items: orderItems.map((i) => `${i.menuItemName} x${i.quantity}`),
  });

  res.status(201).json({
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
    items: orderItems.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      pricePence: item.pricePence,
      quantity: item.quantity,
    })),
  });
});

router.put("/order-batches/:id/edit", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const body = EditOrderBatchBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const existing = await db.select().from(orderBatchesTable).where(eq(orderBatchesTable.id, id));
  if (existing.length === 0) {
    res.status(404).json({ error: "Order batch not found" });
    return;
  }

  await db.delete(orderItemsTable).where(eq(orderItemsTable.batchId, id));

  if (body.data.items.length > 0) {
    const priceMap = await getPriceMap(body.data.items.map((i) => i.menuItemId));
    await db.insert(orderItemsTable).values(
      body.data.items.map((item) => ({
        batchId: id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        pricePence: priceMap.get(item.menuItemId),
      }))
    );
  }

  const [batch] = await db.select().from(orderBatchesTable).where(eq(orderBatchesTable.id, id));

  const orderItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: storedPrice,
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(eq(orderItemsTable.batchId, id));

  const actor = actorFromReq(req);
  await logActivity(actor.name, actor.role, "order_edited", {
    batchId: id,
    customerName: batch.customerName,
    waitressName: batch.waitressName,
  });

  res.json({
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
    items: orderItems.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      pricePence: item.pricePence,
      quantity: item.quantity,
    })),
  });
});

router.post("/order-batches/:id/discard", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [batch] = await db.select().from(orderBatchesTable).where(eq(orderBatchesTable.id, id));
  if (!batch) {
    res.status(404).json({ error: "Order batch not found" });
    return;
  }

  await db
    .update(orderBatchesTable)
    .set({ status: "returned" })
    .where(eq(orderBatchesTable.id, id));

  const actor = actorFromReq(req);
  await logActivity(actor.name, actor.role, "order_discarded", { batchId: id });

  res.json({ ok: true });
});

router.post("/order-batches/:id/complete", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = CompleteOrderBatchParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [batch] = await db
    .update(orderBatchesTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(orderBatchesTable.id, params.data.id))
    .returning();

  if (!batch) {
    res.status(404).json({ error: "Order batch not found" });
    return;
  }

  const orderItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: storedPrice,
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(eq(orderItemsTable.batchId, batch.id));

  const actor = actorFromReq(req);
  const totalPence = orderItems.reduce((s, i) => s + i.pricePence * i.quantity, 0);
  await logActivity(actor.name, actor.role, "order_completed", {
    batchId: batch.id,
    customerName: batch.customerName,
    waitressName: batch.waitressName,
    totalPence,
  });

  const result = {
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
    items: orderItems.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      pricePence: item.pricePence,
      quantity: item.quantity,
    })),
  };

  res.json(CompleteOrderBatchResponse.parse(result));
});

router.post("/order-batches/:id/pay", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = PayOrderBatchParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const actor = actorFromReq(req);

  // If bartender, block payment if the bill is older than 24 hours — admin only
  if (actor.role === "bartender") {
    const [existingBatch] = await db
      .select({ createdAt: orderBatchesTable.createdAt })
      .from(orderBatchesTable)
      .where(eq(orderBatchesTable.id, params.data.id))
      .limit(1);

    if (existingBatch) {
      const ageMs = Date.now() - new Date(existingBatch.createdAt).getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      if (ageMs > twentyFourHours) {
        res.status(403).json({ error: "Admin clearance required: this bill is older than 24 hours." });
        return;
      }
    }
  }

  const [batch] = await db
    .update(orderBatchesTable)
    .set({ status: "paid" })
    .where(eq(orderBatchesTable.id, params.data.id))
    .returning();

  if (!batch) {
    res.status(404).json({ error: "Order batch not found" });
    return;
  }

  const orderItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: storedPrice,
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(eq(orderItemsTable.batchId, batch.id));

  const totalPence = orderItems.reduce((s, i) => s + i.pricePence * i.quantity, 0);
  await logActivity(actor.name, actor.role, "order_paid", {
    batchId: batch.id,
    customerName: batch.customerName,
    waitressName: batch.waitressName,
    totalPence,
  });

  const result = {
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
    items: orderItems.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      pricePence: item.pricePence,
      quantity: item.quantity,
    })),
  };

  res.json(PayOrderBatchResponse.parse(result));
});

router.post("/order-batches/:id/return", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ReturnOrderBatchParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ReturnOrderBatchBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [batch] = await db
    .update(orderBatchesTable)
    .set({ status: "returned", correctionItemIds: body.data.correctionItemIds })
    .where(eq(orderBatchesTable.id, params.data.id))
    .returning();

  if (!batch) {
    res.status(404).json({ error: "Order batch not found" });
    return;
  }

  const orderItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: storedPrice,
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(eq(orderItemsTable.batchId, batch.id));

  const actor = actorFromReq(req);
  await logActivity(actor.name, actor.role, "order_returned", {
    batchId: batch.id,
    customerName: batch.customerName,
    waitressName: batch.waitressName,
    flaggedCount: body.data.correctionItemIds.length,
  });

  res.json(ReturnOrderBatchResponse.parse({
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
    items: orderItems.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      pricePence: item.pricePence,
      quantity: item.quantity,
    })),
  }));
});

router.post("/order-batches/:id/resubmit", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ResubmitOrderBatchParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ResubmitOrderBatchBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const batchId = params.data.id;

  await db.delete(orderItemsTable).where(eq(orderItemsTable.batchId, batchId));

  if (body.data.items.length > 0) {
    const priceMap = await getPriceMap(body.data.items.map((i) => i.menuItemId));
    await db.insert(orderItemsTable).values(
      body.data.items.map((item) => ({
        batchId,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        pricePence: priceMap.get(item.menuItemId),
      }))
    );
  }

  const [batch] = await db
    .update(orderBatchesTable)
    .set({ status: "pending", completedAt: null })
    .where(eq(orderBatchesTable.id, batchId))
    .returning();

  if (!batch) {
    res.status(404).json({ error: "Order batch not found" });
    return;
  }

  const orderItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: storedPrice,
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(eq(orderItemsTable.batchId, batchId));

  const actor = actorFromReq(req);
  await logActivity(actor.name, actor.role, "order_resubmitted", {
    batchId,
    customerName: batch.customerName,
    waitressName: batch.waitressName,
    itemCount: body.data.items.length,
  });

  res.json(ResubmitOrderBatchResponse.parse({
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: null,
    items: orderItems.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      pricePence: item.pricePence,
      quantity: item.quantity,
    })),
  }));
});

router.get("/partial-payments", async (req, res): Promise<void> => {
  const { customerName, waitressName } = req.query;
  const conditions = [];
  if (typeof customerName === "string") conditions.push(eq(partialPaymentsTable.customerName, customerName));
  if (typeof waitressName === "string") conditions.push(eq(partialPaymentsTable.waitressName, waitressName));
  const rows = conditions.length > 0
    ? await db.select().from(partialPaymentsTable).where(and(...conditions)).orderBy(partialPaymentsTable.createdAt)
    : await db.select().from(partialPaymentsTable).orderBy(partialPaymentsTable.createdAt);
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/partial-payments", async (req, res): Promise<void> => {
  const { customerName, waitressName, amountPence } = req.body ?? {};
  if (!customerName || !waitressName || typeof amountPence !== "number" || amountPence <= 0) {
    res.status(400).json({ error: "customerName, waitressName, and amountPence (> 0) are required." });
    return;
  }
  const actor = actorFromReq(req);
  const [row] = await db
    .insert(partialPaymentsTable)
    .values({ customerName, waitressName, amountPence: Math.round(amountPence), recordedBy: actor.name })
    .returning();
  await logActivity(actor.name, actor.role, "partial_payment", {
    customerName,
    waitressName,
    amountPence: Math.round(amountPence),
  });
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

// ─── Public customer order endpoint (no auth required) ──────────────────────
const PublicOrderBody = z.object({
  customerName: z.string().min(1).max(100),
  phone: z.string().min(1).max(30),
  orderType: z.enum(["pickup", "delivery"]),
  deliveryLocation: z.string().max(200).optional(),
  items: z.array(z.object({
    menuItemId: z.number().int().positive(),
    quantity: z.number().int().positive(),
  })).min(1).max(30),
});

router.post("/public/order", async (req, res): Promise<void> => {
  const parsed = PublicOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid order details" });
    return;
  }

  const { customerName, phone, orderType, deliveryLocation, items } = parsed.data;

  // Validate menu item IDs exist
  const menuItemIds = [...new Set(items.map((i) => i.menuItemId))];
  const existingItems = await db
    .select({ id: menuItemsTable.id, pricePence: menuItemsTable.pricePence })
    .from(menuItemsTable)
    .where(inArray(menuItemsTable.id, menuItemIds));

  if (existingItems.length !== menuItemIds.length) {
    res.status(400).json({ error: "One or more menu items not found" });
    return;
  }

  const [batch] = await db
    .insert(orderBatchesTable)
    .values({
      customerName,
      waitressName: "Online",
      status: "pending",
      saleType: "customer_order",
      phone,
      orderType,
      deliveryLocation: deliveryLocation ?? null,
    })
    .returning();

  const priceMap = new Map(existingItems.map((e) => [e.id, e.pricePence]));
  await db.insert(orderItemsTable).values(
    items.map((item) => ({
      batchId: batch.id,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      pricePence: priceMap.get(item.menuItemId),
    }))
  );

  await logActivity("Customer", "customer", "customer_order_placed", {
    batchId: batch.id,
    customerName,
    orderType,
    itemCount: items.length,
  });

  res.status(201).json({ id: batch.id });
});

// ─── Reject a customer order ─────────────────────────────────────────────────
const RejectOrderBody = z.object({
  reason: z.string().max(300).optional(),
});

router.post("/order-batches/:id/reject", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid batch id" });
    return;
  }

  const parsed = RejectOrderBody.safeParse(req.body);
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;

  const [batch] = await db
    .update(orderBatchesTable)
    .set({ status: "returned", rejectionReason: reason })
    .where(and(eq(orderBatchesTable.id, id), eq(orderBatchesTable.saleType, "customer_order")))
    .returning();

  if (!batch) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const actor = actorFromReq(req);
  await logActivity(actor.name, actor.role, "customer_order_rejected", {
    batchId: id,
    customerName: batch.customerName,
    reason,
  });

  res.json({ ok: true });
});

// ─── Public: get order status ─────────────────────────────────────────────────
router.get("/public/order/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const [batch] = await db
    .select({
      id: orderBatchesTable.id,
      status: orderBatchesTable.status,
      rejectionReason: orderBatchesTable.rejectionReason,
    })
    .from(orderBatchesTable)
    .where(and(eq(orderBatchesTable.id, id), eq(orderBatchesTable.saleType, "customer_order")));

  if (!batch) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json({ id: batch.id, status: batch.status, rejectionReason: batch.rejectionReason ?? null });
});

// ─── Public: get order phone number ──────────────────────────────────────────
router.get("/public/settings/order-phone", async (_req, res): Promise<void> => {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "order_phone"));
  res.json({ phone: row?.value ?? null });
});

// ─── Admin: set order phone number ───────────────────────────────────────────
router.post("/settings/order-phone", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const actor = actorFromReq(req);
  if (actor.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const PhoneBody = z.object({ phone: z.string().min(1).max(30) });
  const parsed = PhoneBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Phone number is required" });
    return;
  }
  const { phone } = parsed.data;
  await db
    .insert(settingsTable)
    .values({ key: "order_phone", value: phone.trim() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: phone.trim() } });
  res.json({ ok: true, phone: phone.trim() });
});

router.post("/order-batches/settle-waiter", async (req, res): Promise<void> => {
  const parsed = SettleWaiterAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { waitressName } = parsed.data;

  const unpaidBatches = await db
    .select()
    .from(orderBatchesTable)
    .where(
      and(
        eq(orderBatchesTable.waitressName, waitressName),
        ne(orderBatchesTable.status, "paid"),
        ne(orderBatchesTable.status, "on_hold")
      )
    );

  if (unpaidBatches.length === 0) {
    res.json(SettleWaiterAccountResponse.parse({ waitressName, count: 0, totalPence: 0 }));
    return;
  }

  // If bartender, block settlement if any batch is older than 24 hours — admin only
  const actor2 = actorFromReq(req);
  if (actor2.role === "bartender") {
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const hasOldBatch = unpaidBatches.some(
      (b) => Date.now() - new Date(b.createdAt).getTime() > twentyFourHours
    );
    if (hasOldBatch) {
      res.status(403).json({ error: "Admin clearance required: one or more bills are older than 24 hours." });
      return;
    }
  }

  const batchIds = unpaidBatches.map((b) => b.id);

  await db
    .update(orderBatchesTable)
    .set({ status: "paid" })
    .where(inArray(orderBatchesTable.id, batchIds));

  const allItems = await db
    .select({ pricePence: sql<number>`COALESCE(${orderItemsTable.pricePence}, ${menuItemsTable.pricePence})`, quantity: orderItemsTable.quantity })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(inArray(orderItemsTable.batchId, batchIds));

  const totalPence = allItems.reduce((sum, i) => sum + i.pricePence * i.quantity, 0);

  const actor = actorFromReq(req);
  await logActivity(actor.name, actor.role, "account_settled", {
    waitressName,
    batchCount: unpaidBatches.length,
    totalPence,
  });

  res.json(SettleWaiterAccountResponse.parse({ waitressName, count: unpaidBatches.length, totalPence }));
});

router.post("/order-batches/merge", async (req, res): Promise<void> => {
  const actor = actorFromReq(req);
  if (actor.role !== "admin") {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const body = z.object({
    batchIds: z.array(z.number().int().positive()).min(1),
    newCustomerName: z.string().min(1).max(100),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { batchIds, newCustomerName } = body.data;

  await db
    .update(orderBatchesTable)
    .set({ customerName: newCustomerName })
    .where(inArray(orderBatchesTable.id, batchIds));

  await logActivity(actor.name, actor.role, "bills_merged", { batchIds, newCustomerName });

  res.json({ ok: true, count: batchIds.length, newCustomerName });
});

export default router;
