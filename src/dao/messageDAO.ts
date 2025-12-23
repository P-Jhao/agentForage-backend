/**
 * 消息数据访问对象
 *
 * 新存储格式（每段一条记录）：
 * - user 消息：type='chat', content 为纯字符串
 * - assistant 消息：每个段落单独存储
 */
import { Message } from "./models/index.js";
import type { MessageRole, MessageType } from "./models/Message.js";

// 创建文本消息参数
interface CreateTextMessageData {
  conversationId: number;
  role: MessageRole;
  type: "chat" | "thinking" | "summary" | "error";
  content: string;
}

// 创建工具调用消息参数
interface CreateToolCallMessageData {
  conversationId: number;
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

// 更新工具调用结果参数
interface UpdateToolCallResultData {
  success: boolean;
  result?: unknown;
  error?: string;
  arguments?: Record<string, unknown>; // 工具 LLM 决定的参数
}

// 用户上传的文件信息
export interface UploadedFileInfo {
  filePath: string;
  originalName: string;
  size: number;
  url: string;
}

// 扁平消息格式（用于前端展示）
export interface FlatMessage {
  id: number;
  role: MessageRole;
  type: MessageType;
  content: string;
  // 工具调用专用字段
  callId?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  success?: boolean;
  // 用户上传的文件
  files?: UploadedFileInfo[];
  createdAt: Date;
}

class MessageDAO {
  /**
   * 创建用户消息
   * @param conversationId 会话 ID
   * @param content 消息内容
   * @param files 用户上传的文件信息（可选）
   */
  static async createUserMessage(
    conversationId: number,
    content: string,
    files?: UploadedFileInfo[]
  ) {
    return await Message.create({
      conversationId,
      role: "user",
      type: "chat",
      content,
      files: files && files.length > 0 ? JSON.stringify(files) : null,
    });
  }

  /**
   * 创建 assistant 文本消息（chat/thinking/error）
   */
  static async createAssistantTextMessage(data: CreateTextMessageData) {
    return await Message.create({
      conversationId: data.conversationId,
      role: "assistant",
      type: data.type,
      content: data.content,
    });
  }

  /**
   * 创建 assistant 工具调用消息
   * 初始状态：success=false，等待结果更新
   */
  static async createToolCallMessage(data: CreateToolCallMessageData) {
    return await Message.create({
      conversationId: data.conversationId,
      role: "assistant",
      type: "tool_call",
      content: "",
      callId: data.callId,
      toolName: data.toolName,
      arguments: JSON.stringify(data.arguments),
      success: false,
    });
  }

  /**
   * 更新工具调用结果
   */
  static async updateToolCallResult(callId: string, data: UpdateToolCallResultData) {
    const updateData: Record<string, unknown> = {
      success: data.success,
      result: data.result !== undefined ? JSON.stringify(data.result) : null,
    };

    // 如果有参数，也更新参数
    if (data.arguments) {
      updateData.arguments = JSON.stringify(data.arguments);
    }

    return await Message.update(updateData, { where: { callId } });
  }

  /**
   * 按会话 ID 查询消息（原始记录）
   */
  static async findByConversationId(conversationId: number) {
    return await Message.findAll({
      where: { conversationId },
      order: [["createdAt", "ASC"]],
    });
  }

  /**
   * 按会话 ID 查询消息（扁平格式，用于前端展示）
   */
  static async findFlatByConversationId(conversationId: number): Promise<FlatMessage[]> {
    const messages = await this.findByConversationId(conversationId);
    return messages.map((msg) => {
      const base: FlatMessage = {
        id: msg.id,
        role: msg.role,
        type: msg.type,
        content: msg.content,
        createdAt: msg.createdAt,
      };

      // 工具调用消息添加额外字段
      if (msg.type === "tool_call") {
        base.callId = msg.callId || undefined;
        base.toolName = msg.toolName || undefined;
        base.arguments = msg.arguments ? JSON.parse(msg.arguments) : undefined;
        base.result = msg.result ? JSON.parse(msg.result) : undefined;
        base.success = msg.success ?? undefined;
      }

      // 用户消息添加文件信息
      if (msg.role === "user" && msg.files) {
        base.files = JSON.parse(msg.files);
      }

      return base;
    });
  }

  /**
   * 按会话 ID 删除消息
   */
  static async deleteByConversationId(conversationId: number) {
    return await Message.destroy({ where: { conversationId } });
  }

  /**
   * 查询指定消息 ID 之后的消息（用于总结后获取新消息）
   * @param conversationId 会话 ID
   * @param afterMessageId 起始消息 ID（不包含）
   * @returns id > afterMessageId 的消息列表
   */
  static async findAfterMessageId(
    conversationId: number,
    afterMessageId: number
  ): Promise<FlatMessage[]> {
    const { Op } = await import("sequelize");
    const messages = await Message.findAll({
      where: {
        conversationId,
        id: { [Op.gt]: afterMessageId },
      },
      order: [["createdAt", "ASC"]],
    });

    return messages.map((msg) => {
      const base: FlatMessage = {
        id: msg.id,
        role: msg.role,
        type: msg.type,
        content: msg.content,
        createdAt: msg.createdAt,
      };

      // 工具调用消息添加额外字段
      if (msg.type === "tool_call") {
        base.callId = msg.callId || undefined;
        base.toolName = msg.toolName || undefined;
        base.arguments = msg.arguments ? JSON.parse(msg.arguments) : undefined;
        base.result = msg.result ? JSON.parse(msg.result) : undefined;
        base.success = msg.success ?? undefined;
      }

      // 用户消息添加文件信息
      if (msg.role === "user" && msg.files) {
        base.files = JSON.parse(msg.files);
      }

      return base;
    });
  }
}

export default MessageDAO;
