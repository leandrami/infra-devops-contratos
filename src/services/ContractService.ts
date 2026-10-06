import { redis } from "../config/redis";
import { AppDataSource } from "../config/database";
import { Contract } from "../entities/Contract";

export class ContractService {
  async createContract(title: string, userId: string, description: string, value: number): Promise<Contract> {
    const contractRepo = AppDataSource.getRepository(Contract);

    const contract = contractRepo.create({
      title,
      userId,
      description,
      value,
      status: "active",
    });

    await contractRepo.save(contract);
    
    const redisKey = `contract:last:${userId}`;
    await redis.set(redisKey, JSON.stringify(contract), "EX", 3600);

    return contract;
  }
}
