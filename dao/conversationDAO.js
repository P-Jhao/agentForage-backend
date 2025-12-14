/**
 * 会话数据访问对象
 */
import { Conversation } from "./models/index.js";

class ConversationDAO {
  static async create(data) {
    return await Conversation.create(data);
  }

  static async findById(id) {
    return await Conversation.findByPk(id);
  }

  static async findByUserId(userId) {
    return await Conversation.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });
  }

  static async deleteById(id) {
    return await Conversation.destroy({ where: { id } });
  }
}

export default ConversationDAO;
