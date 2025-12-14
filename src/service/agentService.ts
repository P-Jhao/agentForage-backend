/**
 * Agent 服务
 */
import AgentDAO from "../dao/agentDAO.js";

class AgentService {
  /**
   * 获取所有可用 Agent 列表
   */
  static async getAgentList() {
    return await AgentDAO.findAll();
  }

  /**
   * 根据 ID 获取 Agent 配置
   */
  static async getAgentById(agentId: string | number) {
    const agent = await AgentDAO.findById(Number(agentId));
    if (!agent) {
      throw Object.assign(new Error("Agent 不存在"), { status: 404 });
    }
    return agent;
  }
}

export default AgentService;
