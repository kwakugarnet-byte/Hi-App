import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, menuItemsTable, orderBatchesTable, orderItemsTable } from "@workspace/db";
import {
  GetMenuItemsResponse,
  GetOrderBatchesResponse,
  CreateOrderBatchBody,
  CompleteOrderBatchParams,
  CompleteOrderBatchResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

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
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(eq(orderItemsTable.batchId, batch.id));

  const result = {
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: null,
    items: orderItems.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      quantity: item.quantity,
    })),
  };

  res.status(201).json(result);
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
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .where(eq(orderItemsTable.batchId, batch.id));

  const result = {
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
    items: orderItems.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      quantity: item.quantity,
    })),
  };

  res.json(CompleteOrderBatchResponse.parse(result));
});

export default router;
