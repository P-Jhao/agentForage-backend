/**
 * 会话数据访问对象
 */
import { Conversation } from "./models/index.js";

interface CreateConversationData {
  userId: number;
  agentId: number;
  title?: string;
}

class ConversationDAO {
  static async create(data: CreateConversationData) {
    return await Conversation.create(data);
  }

  static async findById(id: number) {
    return await Conversation.findByPk(id);
  }

  static async findByUserId(userId: number) {
    return await Conversation.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });
  }

  static async deleteById(id: number) {
    return await Conversation.destroy({ where: { id } });
  }
}

export default ConversationDAO;
