/**
 * 对话服务
 * 处理会话持久化和消息管理
 */
import ConversationDAO from "../dao/conversationDAO.js";
import MessageDAO from "../dao/messageDAO.js";

// 动态导入 gateway
const loadGateway = async () => {
  return await import("agentforge-gateway");
};

interface SendMessageParams {
  userId: number;
  agentId: number;
  message: string;
  conversationId?: number;
}

class ChatService {
  /**
   * 发送消息并获取 AI 回复（同步方式）
   * 用于需要持久化会话的场景
   */
  static async sendMessage({ userId, agentId, message, conversationId }: SendMessageParams) {
    // 如果没有会话 ID，创建新会话
    let convId = conversationId;
    if (!convId) {
      const conversation = await ConversationDAO.create({ userId, agentId });
      convId = conversation.id;
    }

    // 保存用户消息
    await MessageDAO.create({
      conversationId: convId,
      role: "user",
      content: message,
    });

    // 获取历史消息构建上下文
    const history = await MessageDAO.findByConversationId(convId);
    const messages = history.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
    // 添加当前消息
    messages.push({ role: "user", content: message });

    // 调用 gateway 获取回复（通过 LangGraph 执行）
    const { chatService, isErr } = await loadGateway();
    const result = await chatService.chat({ messages });

    if (isErr(result)) {
      throw new Error(result.error.message);
    }

    const aiResponse = result.data.content;

    // 保存 AI 回复
    await MessageDAO.create({
      conversationId: convId,
      role: "assistant",
      content: aiResponse,
    });

    return {
      conversationId: convId,
      reply: aiResponse,
    };
  }

  /**
   * 获取会话历史消息
   */
  static async getHistory(conversationId: number) {
    return await MessageDAO.findByConversationId(conversationId);
  }

  /**
   * 获取用户的会话列表
   */
  static async getConversations(userId: number) {
    return await ConversationDAO.findByUserId(userId);
  }
}

export default ChatService;
