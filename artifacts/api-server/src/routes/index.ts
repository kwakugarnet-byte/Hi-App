import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import ordersRouter from "./orders";
import pinAuthRouter from "./pinAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(pinAuthRouter);
router.use(ordersRouter);

export default router;
