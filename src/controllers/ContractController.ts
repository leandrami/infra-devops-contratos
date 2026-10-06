import { Request, Response } from "express";
import { ContractService } from "../services/ContractService";

export class ContractController {
  private contractService = new ContractService();

  async handle(req: Request, res: Response): Promise<Response> {
    const { title, userId, description, value } = req.body;

    if (!title || !userId) {
      return res.status(400).json({ error: "Missing required fields: title, userId" });
    }

    try {
      const contract = await this.contractService.createContract(title, userId, description, value);
      return res.status(201).json({ message: "Contract created successfully", contract });
    } catch (error: any) {
      return res.status(500).json({ error: "Internal server error", details: error.message });
    }
  }
}
