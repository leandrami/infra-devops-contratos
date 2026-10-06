import { Router } from "express";
import { ContractController } from "../controllers/ContractController";
import { metricsController } from "../middlewares/metricsMiddleware";

const router = Router();
const contractController = new ContractController();

router.post("/contracts", (req, res, next) => contractController.handle(req, res).catch(next));
router.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
router.get("/metrics", metricsController);

export { router };
