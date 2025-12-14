/**
 * Agent 配置数据访问对象
 */
import { Agent } from "./models/index.js";

interface CreateAgentData {
  name: string;
  displayName: string;
  description?: string;
  systemPrompt?: string;
  model?: "qwen" | "deepseek";
}

class AgentDAO {
  static async findAll() {
    return await Agent.findAll({ where: { isActive: true } });
  }

  static async findById(id: number) {
    return await Agent.findByPk(id);
  }

  static async findByName(name: string) {
    return await Agent.findOne({ where: { name } });
  }

  static async create(agentData: CreateAgentData) {
    return await Agent.create(agentData);
  }

  static async updateById(id: number, data: Partial<CreateAgentData>) {
    return await Agent.update(data, { where: { id } });
  }
}

export default AgentDAO;
