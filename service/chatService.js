/**
 * 对话服务
 */
import ConversationDAO from "../dao/conversationDAO.js";
import MessageDAO from "../dao/messageDAO.js";
import LLMService from "./llmService.js";

class ChatService {
  /**
   * 发送消息并获取 AI 回复
   */
  static async sendMessage({ userId, agentId, message, conversationId }) {
    // 如果没有会话 ID，创建新会话
    let conversation;
    if (!conversationId) {
      conversation = await ConversationDAO.create({ userId, agentId });
      conversationId = conversation.id;
    }

    // 保存用户消息
    await MessageDAO.create({
      conversationId,
      role: "user",
      content: message,
    });

    // TODO: 调用 LLM 获取回复
    const aiResponse = await LLMService.chat({
      agentId,
      message,
      conversationId,
    });

    // 保存 AI 回复
    await MessageDAO.create({
      conversationId,
      role: "assistant",
      content: aiResponse,
    });

    return {
      conversationId,
      reply: aiResponse,
    };
  }

  /**
   * 获取会话历史消息
   */
  static async getHistory(conversationId) {
    return await MessageDAO.findByConversationId(conversationId);
  }

  /**
   * 获取用户的会话列表
   */
  static async getConversations(userId) {
    return await ConversationDAO.findByUserId(userId);
  }
}

export default ChatService;
