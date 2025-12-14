/**
 * Agent 配置数据访问对象
 */
import { Agent } from "./models/index.js";

class AgentDAO {
  static async findAll() {
    return await Agent.findAll({ where: { isActive: true } });
  }

  static async findById(id) {
    return await Agent.findByPk(id);
  }

  static async findByName(name) {
    return await Agent.findOne({ where: { name } });
  }

  static async create(agentData) {
    return await Agent.create(agentData);
  }

  static async updateById(id, data) {
    return await Agent.update(data, { where: { id } });
  }
}

export default AgentDAO;
