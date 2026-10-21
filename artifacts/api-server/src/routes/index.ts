
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import devicesRouter from "./devices";
import securityEventsRouter from "./security-events";
import authRouter from "./auth";
import requireAuth from "../middleware/require-auth";

const router: IRouter = Router();


router.use(healthRouter);
router.use(authRouter);

router.use(requireAuth);
router.use(devicesRouter);
router.use(securityEventsRouter);

export default router;
