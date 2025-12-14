/**
 * LLM Gateway 服务
 * 统一管理多模型调用
 */

interface ChatParams {
  agentId: number;
  message: string;
  conversationId: number;
}

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CallLLMParams {
  messages: LLMMessage[];
  model?: string;
}

class LLMService {
  /**
   * 对话接口
   */
  static async chat({
    agentId: _agentId,
    message,
    conversationId: _conversationId,
  }: ChatParams): Promise<string> {
    // TODO: 根据 Agent 配置选择模型，调用对应 API
    // 目前返回占位响应
    return `[LLM 响应占位] 收到消息: ${message}`;
  }

  /**
   * 调用通义千问
   */
  static async callQwen(_params: CallLLMParams): Promise<string> {
    // TODO: 实现千问 API 调用
    return "";
  }

  /**
   * 调用 DeepSeek
   */
  static async callDeepSeek(_params: CallLLMParams): Promise<string> {
    // TODO: 实现 DeepSeek API 调用
    return "";
  }

  /**
   * 获取文本 Embedding
   */
  static async getEmbedding(_text: string): Promise<number[]> {
    // TODO: 实现 Embedding 接口
    return [];
  }
}

export default LLMService;
