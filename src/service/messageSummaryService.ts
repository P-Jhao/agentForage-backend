/**
 * 消息历史总结服务
 * 负责判断是否需要总结、调用 LLM 生成总结、管理总结状态
 */
import type { FlatMessage } from "../dao/messageDAO.js";
import MessageDAO from "../dao/messageDAO.js";
import { Conversation } from "../dao/models/index.js";

// 动态导入 Gateway
const loadGateway = async () => {
  return await import("agentforge-gateway");
};

/**
 * 总结状态
 */
interface SummaryState {
  // 是否正在总结中
  isSummarizing: boolean;
  // 最后触发时间
  lastTriggeredAt?: Date;
}

/**
 * 会话总结信息（用于构建上下文）
 */
export interface ConversationSummaryInfo {
  // 总结内容
  summary: string | null;
  // 总结覆盖到的最后一条消息 ID
  summaryUntilMessageId: number | null;
}

/**
 * LLM 上下文消息格式
 */
export interface ContextMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

class MessageSummaryService {
  // 内存中跟踪正在总结的会话
  private summarizingTasks: Map<number, SummaryState> = new Map();

  // 总结阈值：消息数量超过此值时触发总结
  public readonly SUMMARY_THRESHOLD = 20;

  /**
   * 获取最后一轮对话的起始索引
   * 最后一轮定义为：最后一个 user 消息及其后续的所有 assistant 回复
   * @param messages 消息列表
   * @returns 最后一轮的起始索引，如果没有 user 消息则返回 0
   */
  getLastRoundStartIndex(messages: FlatMessage[]): number {
    if (messages.length === 0) {
      return 0;
    }

    // 从后往前查找最后一个 user 消息
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        return i;
      }
    }

    // 没有找到 user 消息，返回 0（保留所有消息）
    return 0;
  }

  /**
   * 检查会话是否正在总结中
   * @param conversationId 会话 ID
   */
  isSummarizing(conversationId: number): boolean {
    const state = this.summarizingTasks.get(conversationId);
    return state?.isSummarizing ?? false;
  }

  /**
   * 检查并触发异步总结（LLM 回复完成后调用）
   * @param conversationId 会话 ID
   */
  async checkAndTriggerSummary(conversationId: number): Promise<void> {
    // 检查是否已在总结中，避免重复触发
    if (this.isSummarizing(conversationId)) {
      console.log(`[MessageSummaryService] 会话 ${conversationId} 正在总结中，跳过`);
      return;
    }

    // 获取所有消息
    const messages = await MessageDAO.findFlatByConversationId(conversationId);

    // 获取会话信息，检查是否已有总结
    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation) {
      console.error(`[MessageSummaryService] 会话 ${conversationId} 不存在`);
      return;
    }

    // 计算需要总结的消息范围
    // 保留最后一轮对话，总结之前的消息
    const lastRoundStartIndex = this.getLastRoundStartIndex(messages);

    // 如果最后一轮就是全部消息，不需要总结
    if (lastRoundStartIndex === 0) {
      console.log(`[MessageSummaryService] 会话 ${conversationId} 只有一轮对话，跳过总结`);
      return;
    }

    // 获取旧总结信息
    const existingSummary = conversation.summary;
    const summaryUntilMessageId = conversation.summaryUntilMessageId;

    // 计算需要新总结的消息（总结后的消息，不包括最后一轮）
    let newMessagesToSummarize: FlatMessage[];
    if (summaryUntilMessageId) {
      // 已有总结：只取 summaryUntilMessageId 之后、最后一轮之前的消息
      newMessagesToSummarize = messages.filter(
        (m) => m.id > summaryUntilMessageId && messages.indexOf(m) < lastRoundStartIndex
      );
    } else {
      // 无总结：取最后一轮之前的所有消息
      newMessagesToSummarize = messages.slice(0, lastRoundStartIndex);
    }

    // 检查新消息数量是否超过阈值
    if (newMessagesToSummarize.length <= this.SUMMARY_THRESHOLD) {
      console.log(
        `[MessageSummaryService] 会话 ${conversationId} 新消息数 ${newMessagesToSummarize.length} 未超过阈值 ${this.SUMMARY_THRESHOLD}，跳过`
      );
      return;
    }

    // 标记为正在总结
    this.summarizingTasks.set(conversationId, {
      isSummarizing: true,
      lastTriggeredAt: new Date(),
    });

    console.log(
      `[MessageSummaryService] 开始异步总结会话 ${conversationId}，新消息数: ${newMessagesToSummarize.length}，已有总结: ${existingSummary ? "是" : "否"}`
    );

    // 异步执行总结，不阻塞主流程
    this.executeSummary(conversationId, newMessagesToSummarize, existingSummary).catch((error) => {
      console.error(`[MessageSummaryService] 总结失败:`, error);
    });
  }

  /**
   * 执行总结任务（内部方法）
   * @param conversationId 会话 ID
   * @param newMessages 需要总结的新消息
   * @param existingSummary 已有的总结（用于增量总结）
   */
  private async executeSummary(
    conversationId: number,
    newMessages: FlatMessage[],
    existingSummary: string | null
  ): Promise<void> {
    try {
      // 将 FlatMessage 转换为 Gateway 需要的格式
      const gatewayMessages = this.convertToGatewayMessages(newMessages);

      // 如果有旧总结，在消息列表前添加旧总结作为上下文
      if (existingSummary) {
        gatewayMessages.unshift({
          role: "system",
          content: `【之前的对话摘要】\n${existingSummary}\n\n请将上述摘要与以下新对话内容合并，生成一个完整的新摘要：`,
        });
      }

      // 调用 Gateway 生成总结
      const { summarizeMessages } = await loadGateway();
      const result = await summarizeMessages({ messages: gatewayMessages });

      if (!result.success || !result.summary) {
        console.error(`[MessageSummaryService] 总结生成失败: ${result.error || "未知错误"}`);
        return;
      }

      // 获取需要总结的最后一条消息的 ID
      const lastMessageId = newMessages[newMessages.length - 1].id;

      // 更新数据库
      await Conversation.update(
        {
          summary: result.summary,
          summaryUntilMessageId: lastMessageId,
        },
        { where: { id: conversationId } }
      );

      console.log(
        `[MessageSummaryService] 会话 ${conversationId} 总结完成，覆盖到消息 ${lastMessageId}，增量总结: ${existingSummary ? "是" : "否"}`
      );
    } finally {
      // 无论成功失败，都清除总结状态
      this.summarizingTasks.delete(conversationId);
    }
  }

  /**
   * 将 FlatMessage 转换为 Gateway 需要的消息格式
   */
  private convertToGatewayMessages(
    messages: FlatMessage[]
  ): Array<{ role: "user" | "assistant" | "system"; content: string }> {
    const result: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
    let currentAssistantContent = "";
    let lastRole: string | null = null;

    for (const msg of messages) {
      if (msg.role === "user") {
        // 保存之前的 assistant 内容
        if (lastRole === "assistant" && currentAssistantContent) {
          result.push({ role: "assistant", content: currentAssistantContent });
          currentAssistantContent = "";
        }
        result.push({ role: "user", content: msg.content });
        lastRole = "user";
      } else if (msg.role === "assistant") {
        // 收集所有类型的内容，包括工具调用
        if (msg.type === "tool_call") {
          const toolName = msg.toolName || "unknown";
          const toolArgs = msg.arguments ? JSON.stringify(msg.arguments) : "{}";
          const toolResult = msg.result ? JSON.stringify(msg.result) : "无结果";
          const toolInfo = `[调用工具 ${toolName}，参数: ${toolArgs}，结果: ${toolResult}]`;
          currentAssistantContent += (currentAssistantContent ? "\n" : "") + toolInfo;
        } else if (msg.content) {
          currentAssistantContent += (currentAssistantContent ? "\n" : "") + msg.content;
        }
        lastRole = "assistant";
      }
    }

    // 保存最后的 assistant 内容
    if (lastRole === "assistant" && currentAssistantContent) {
      result.push({ role: "assistant", content: currentAssistantContent });
    }

    return result;
  }

  /**
   * 构建 LLM 上下文消息
   * 如果有有效总结，返回 [总结消息] + [总结后的消息]
   * 否则返回所有原始消息（优雅降级）
   * @param summaryInfo 会话总结信息
   * @param allMessages 所有消息
   */
  buildContextMessages(
    summaryInfo: ConversationSummaryInfo,
    allMessages: FlatMessage[]
  ): ContextMessage[] {
    const { summary, summaryUntilMessageId } = summaryInfo;

    // 如果没有总结或正在总结中，使用所有原始消息（降级）
    if (!summary || !summaryUntilMessageId) {
      return this.convertToGatewayMessages(allMessages);
    }

    // 有有效总结，构建 [总结] + [总结后的消息]
    const result: ContextMessage[] = [];

    // 添加总结作为系统消息
    result.push({
      role: "system",
      content: `以下是之前对话的摘要：\n${summary}`,
    });

    // 获取总结后的消息（id > summaryUntilMessageId）
    const newMessages = allMessages.filter((m) => m.id > summaryUntilMessageId);

    // 转换新消息为上下文格式
    const convertedNewMessages = this.convertToGatewayMessages(newMessages);
    result.push(...convertedNewMessages);

    return result;
  }

  /**
   * 获取会话的总结信息
   * @param conversationId 会话 ID
   */
  async getConversationSummaryInfo(conversationId: number): Promise<ConversationSummaryInfo> {
    // 如果正在总结中，返回空总结（触发降级）
    if (this.isSummarizing(conversationId)) {
      return { summary: null, summaryUntilMessageId: null };
    }

    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation) {
      return { summary: null, summaryUntilMessageId: null };
    }

    return {
      summary: conversation.summary,
      summaryUntilMessageId: conversation.summaryUntilMessageId,
    };
  }
}

// 导出单例
export default new MessageSummaryService();
