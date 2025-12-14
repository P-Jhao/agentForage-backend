/**
 * 消息数据访问对象
 */
import { Message } from "./models/index.js";

interface CreateMessageData {
  conversationId: number;
  role: "user" | "assistant" | "system";
  content: string;
}

class MessageDAO {
  static async create(data: CreateMessageData) {
    return await Message.create(data);
  }

  static async findByConversationId(conversationId: number) {
    return await Message.findAll({
      where: { conversationId },
      order: [["createdAt", "ASC"]],
    });
  }

  static async deleteByConversationId(conversationId: number) {
    return await Message.destroy({ where: { conversationId } });
  }
}

export default MessageDAO;
