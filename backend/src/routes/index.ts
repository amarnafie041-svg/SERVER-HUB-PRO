import { Router, type IRouter } from "express";
import authRouter from "./auth";
import usersRouter from "./users";
import settingsRouter from "./settings";
import healthRouter from "./health";
import systemRouter from "./system";
import filesRouter from "./files";
import aiRouter from "./ai";
import { terminalRouterAPI } from "./terminal";
import logsRouter from "./logs";
import activityRouter from "./activity";
import dockerRouter from "./docker";
import portsRouter from "./ports";
import domainsRouter from "./domains";
import hostingRouter from "./hosting";
import telegramAdminRouter from "./telegram-admin";
import startupRouter from "./startup";

const router: IRouter = Router();

router.use(authRouter);
router.use(usersRouter);
router.use(settingsRouter);
router.use(healthRouter);
router.use(systemRouter);
router.use(filesRouter);
router.use(aiRouter);
router.use(terminalRouterAPI);
router.use(logsRouter);
router.use(activityRouter);
router.use(dockerRouter);
router.use(portsRouter);
router.use(domainsRouter);
router.use(hostingRouter);
router.use(telegramAdminRouter);
router.use(startupRouter);

// Lightweight ping for uptime monitoring
router.get("/ping", (_req, res) => res.json({ ok: true, time: Date.now() }));

export default router;
