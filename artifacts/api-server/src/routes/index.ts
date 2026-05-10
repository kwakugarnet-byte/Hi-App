import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import ordersRouter from "./orders";
import pinAuthRouter from "./pinAuth";
import adminRouter from "./admin";
import shiftsRouter from "./shifts";
import activityLogsRouter from "./activityLogs";
import messagesRouter from "./messages";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(pinAuthRouter);
router.use(adminRouter);
router.use(ordersRouter);
router.use(shiftsRouter);
router.use(activityLogsRouter);
router.use(messagesRouter);

export default router;
