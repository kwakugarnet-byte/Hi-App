import { Router, type IRouter } from "express";
import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db, menuItemsTable, orderBatchesTable, orderItemsTable, shiftsTable } from "@workspace/db";
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

router.get("/order-batches", async (req, res): Promise<void> => {
  const batches = await db.select().from(orderBatchesTable).orderBy(orderBatchesTable.createdAt);

  const allItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: menuItemsTable.pricePence,
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
    await db.insert(orderItemsTable).values(
      items.map((item) => ({
        batchId: batch.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      }))
    );
  }

  const orderItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: menuItemsTable.pricePence,
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

router.post("/order-batches/direct", async (req, res): Promise<void> => {
  const parsed = CreateOrderBatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { customerName, waitressName, items } = parsed.data;

  const [batch] = await db
    .insert(orderBatchesTable)
    .values({ customerName, waitressName, status: "completed", completedAt: new Date() })
    .returning();

  if (items.length > 0) {
    await db.insert(orderItemsTable).values(
      items.map((item) => ({
        batchId: batch.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      }))
    );
  }

  const orderItems = await db
    .select({
      id: orderItemsTable.id,
      batchId: orderItemsTable.batchId,
      menuItemId: orderItemsTable.menuItemId,
      menuItemName: menuItemsTable.name,
      pricePence: menuItemsTable.pricePence,
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
    await db.insert(orderItemsTable).values(
      body.data.items.map((item) => ({
        batchId: id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
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
      pricePence: menuItemsTable.pricePence,
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
      pricePence: menuItemsTable.pricePence,
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

  // If bartender, block payment if the waitress has ended their shift today — admin only
  if (actor.role === "bartender") {
    const [existingBatch] = await db
      .select({ waitressName: orderBatchesTable.waitressName })
      .from(orderBatchesTable)
      .where(eq(orderBatchesTable.id, params.data.id))
      .limit(1);

    if (existingBatch) {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const [endedShift] = await db
        .select({ endedAt: shiftsTable.endedAt })
        .from(shiftsTable)
        .where(
          and(
            eq(shiftsTable.staffName, existingBatch.waitressName),
            gte(shiftsTable.startedAt, dayStart),
            lte(shiftsTable.startedAt, dayEnd),
          )
        )
        .orderBy(shiftsTable.startedAt)
        .limit(1);

      if (endedShift?.endedAt) {
        res.status(403).json({ error: "Admin clearance required: this waitress has ended their shift." });
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
      pricePence: menuItemsTable.pricePence,
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
      pricePence: menuItemsTable.pricePence,
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
    await db.insert(orderItemsTable).values(
      body.data.items.map((item) => ({
        batchId,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
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
      pricePence: menuItemsTable.pricePence,
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
        ne(orderBatchesTable.status, "paid")
      )
    );

  if (unpaidBatches.length === 0) {
    res.json(SettleWaiterAccountResponse.parse({ waitressName, count: 0, totalPence: 0 }));
    return;
  }

  const batchIds = unpaidBatches.map((b) => b.id);

  await db
    .update(orderBatchesTable)
    .set({ status: "paid" })
    .where(inArray(orderBatchesTable.id, batchIds));

  const allItems = await db
    .select({ pricePence: menuItemsTable.pricePence, quantity: orderItemsTable.quantity })
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

export default router;
