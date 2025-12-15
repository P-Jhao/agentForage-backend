/**
 * LLM Gateway 服务
 * 调用 agentforge-gateway 进行 LLM 交互
 */

// 消息类型
interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatParams {
  agentId: string;
  messages: Message[];
}

// 动态导入 gateway（避免类型声明问题）
const loadGateway = async () => {
  return await import("agentforge-gateway");
};

class LLMService {
  /**
   * 同步对话（等待完整响应）
   */
  static async chat({ agentId, messages }: ChatParams): Promise<string> {
    const { chatService, isErr } = await loadGateway();
    const result = await chatService.chat({ agentId, messages });

    if (isErr(result)) {
      throw new Error(result.error.message);
    }

    return result.data.content;
  }

  /**
   * 流式对话（返回 AsyncGenerator）
   */
  static async *stream({ agentId, messages }: ChatParams) {
    const { chatService } = await loadGateway();
    yield* chatService.stream({ agentId, messages });
  }

  /**
   * 简单对话（不使用 Agent，直接调用 LLM）
   */
  static async simpleChat(messages: Message[], model?: "qwen" | "deepseek"): Promise<string> {
    const { chatService, isErr } = await loadGateway();
    const result = await chatService.simpleChat(messages, model);

    if (isErr(result)) {
      throw new Error(result.error.message);
    }

    return result.data.content;
  }
}

export default LLMService;
