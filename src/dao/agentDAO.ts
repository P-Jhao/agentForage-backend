/**
 * Agent 配置数据访问对象
 */
import { Agent } from "./models/index.js";

interface CreateAgentData {
  displayName: string;
  userId: number; // 创建者 ID
  description?: string;
  systemPrompt?: string;
}

class AgentDAO {
  static async findAll() {
    return await Agent.findAll({ where: { isActive: true } });
  }

  static async findById(id: number) {
    return await Agent.findByPk(id);
  }

  static async create(agentData: CreateAgentData) {
    return await Agent.create(agentData);
  }

  static async updateById(id: number, data: Partial<CreateAgentData>) {
    return await Agent.update(data, { where: { id } });
  }
}

export default AgentDAO;
