/**
 * LLM Gateway 服务
 * 统一管理多模型调用
 */

class LLMService {
  /**
   * 对话接口
   */
  static async chat({ agentId, message, conversationId }) {
    // TODO: 根据 Agent 配置选择模型，调用对应 API
    // 目前返回占位响应
    return `[LLM 响应占位] 收到消息: ${message}`;
  }

  /**
   * 调用通义千问
   */
  static async callQwen({ messages, model = "qwen-turbo" }) {
    // TODO: 实现千问 API 调用
  }

  /**
   * 调用 DeepSeek
   */
  static async callDeepSeek({ messages, model = "deepseek-chat" }) {
    // TODO: 实现 DeepSeek API 调用
  }

  /**
   * 获取文本 Embedding
   */
  static async getEmbedding(text) {
    // TODO: 实现 Embedding 接口
  }
}

export default LLMService;
