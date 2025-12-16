/**
 * 消息数据访问对象
 *
 * 存储格式：
 * - user 消息：content 为纯字符串
 * - assistant 消息：content 为 JSON 数组 [{type, content}, ...]
 */
import { Message } from "./models/index.js";
import type { MessageRole, MessageSegment } from "./models/Message.js";

// 创建消息参数
interface CreateMessageData {
  conversationId: number;
  role: MessageRole;
  content: string; // user: 纯字符串; assistant: JSON 字符串
}

// 创建 assistant 消息参数
interface CreateAssistantMessageData {
  conversationId: number;
  segments: MessageSegment[];
}

class MessageDAO {
  /**
   * 创建消息
   */
  static async create(data: CreateMessageData) {
    return await Message.create(data);
  }

  /**
   * 创建用户消息
   */
  static async createUserMessage(conversationId: number, content: string) {
    return await this.create({
      conversationId,
      role: "user",
      content,
    });
  }

  /**
   * 创建 assistant 消息
   * 将段落数组序列化为 JSON 字符串存储
   */
  static async createAssistantMessage(data: CreateAssistantMessageData) {
    return await this.create({
      conversationId: data.conversationId,
      role: "assistant",
      content: JSON.stringify(data.segments),
    });
  }

  /**
   * 按会话 ID 查询消息
   */
  static async findByConversationId(conversationId: number) {
    return await Message.findAll({
      where: { conversationId },
      order: [["createdAt", "ASC"]],
    });
  }

  /**
   * 按会话 ID 删除消息
   */
  static async deleteByConversationId(conversationId: number) {
    return await Message.destroy({ where: { conversationId } });
  }
}

export default MessageDAO;
