/**
 * 消息数据访问对象
 */
import { Message } from "./models/index.js";

class MessageDAO {
  static async create(data) {
    return await Message.create(data);
  }

  static async findByConversationId(conversationId) {
    return await Message.findAll({
      where: { conversationId },
      order: [["createdAt", "ASC"]],
    });
  }

  static async deleteByConversationId(conversationId) {
    return await Message.destroy({ where: { conversationId } });
  }
}

export default MessageDAO;
