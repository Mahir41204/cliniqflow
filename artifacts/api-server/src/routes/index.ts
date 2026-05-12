import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import clinicsRouter from "./clinics";
import patientsRouter from "./patients";
import publicRouter from "./public";
import webhookRouter from "./webhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(clinicsRouter);
router.use(patientsRouter);
router.use(publicRouter);
router.use(webhookRouter);

export default router;
