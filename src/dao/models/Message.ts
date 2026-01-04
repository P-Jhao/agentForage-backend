/**
 * 消息模型
 * 存储对话中的单条消息记录
 *
 * 新存储格式（每段一条记录）：
 * - user 消息：type='chat', content 为纯字符串
 * - assistant 消息：每个段落单独存储，按 createdAt 排序
 *   - type='chat'/'thinking'/'error': content 为文本内容
 *   - type='tool_call': 使用 toolName/callId/arguments/result/success 字段
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

// 消息角色类型
export type MessageRole = "user" | "assistant" | "system";

// 消息类型（每条消息只有一个类型）
export type MessageType =
  | "chat" // 普通对话消息
  | "thinking" // AI 思考过程
  | "tool_call" // 工具调用
  | "summary" // 消息总结
  | "error" // 错误消息
  // 提示词增强相关类型
  | "user_original" // 开启增强时的用户原始输入
  | "user_answer" // 智能迭代中用户对澄清问题的回复
  | "reviewer" // 审查者输出
  | "questioner" // 提问者输出
  | "expert" // 专家分析输出
  | "enhancer" // 增强后的提示词
  // 轮次结束统计
  | "turn_end"; // 对话轮次结束统计信息

// 基础消息段落（用于前端展示）
export interface BaseMessageSegment {
  type:
    | "thinking"
    | "chat"
    | "tool"
    | "summary"
    | "error"
    // 提示词增强相关类型
    | "user_original"
    | "user_answer"
    | "reviewer"
    | "questioner"
    | "expert"
    | "enhancer"
    // 轮次结束统计
    | "turn_end";
  content: string;
}

// 工具调用段落（用于前端展示）
export interface ToolCallSegment {
  type: "tool_call";
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  success: boolean;
}

// 消息段落（前端展示用）
export type MessageSegment = BaseMessageSegment | ToolCallSegment;

interface MessageAttributes {
  id: number;
  conversationId: number;
  role: MessageRole;
  type: MessageType;
  content: string;
  // 工具调用专用字段
  callId: string | null;
  toolName: string | null;
  arguments: string | null; // JSON 字符串
  result: string | null; // JSON 字符串
  success: boolean | null;
  // 用户上传的文件信息（JSON 字符串）
  files: string | null;
  // 中断标记（消息是否因用户中断而不完整）
  aborted: boolean | null;
  // 工具输出文件信息（JSON 字符串）
  outputFiles: string | null;
}

type MessageCreationAttributes = Optional<
  MessageAttributes,
  | "id"
  | "callId"
  | "toolName"
  | "arguments"
  | "result"
  | "success"
  | "files"
  | "aborted"
  | "outputFiles"
>;

class Message
  extends Model<MessageAttributes, MessageCreationAttributes>
  implements MessageAttributes
{
  declare id: number;
  declare conversationId: number;
  declare role: MessageRole;
  declare type: MessageType;
  declare content: string;
  declare callId: string | null;
  declare toolName: string | null;
  declare arguments: string | null;
  declare result: string | null;
  declare success: boolean | null;
  declare files: string | null;
  declare aborted: boolean | null;
  declare outputFiles: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * 转换为前端展示用的段落格式
   */
  toSegment(): MessageSegment {
    if (this.type === "tool_call") {
      return {
        type: "tool_call",
        callId: this.callId || "",
        toolName: this.toolName || "",
        arguments: this.arguments ? JSON.parse(this.arguments) : {},
        result: this.result ? JSON.parse(this.result) : undefined,
        success: this.success ?? false,
      };
    }
    return {
      type: this.type as BaseMessageSegment["type"],
      content: this.content,
    };
  }
}

Message.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    conversationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "会话 ID",
    },
    role: {
      type: DataTypes.ENUM("user", "assistant", "system"),
      allowNull: false,
      comment: "消息角色",
    },
    type: {
      type: DataTypes.ENUM(
        "chat",
        "thinking",
        "tool_call",
        "summary",
        "error",
        // 提示词增强相关类型
        "user_original",
        "user_answer",
        "reviewer",
        "questioner",
        "expert",
        "enhancer",
        // 轮次结束统计
        "turn_end"
      ),
      allowNull: false,
      defaultValue: "chat",
      comment: "消息类型",
    },
    content: {
      type: DataTypes.TEXT("medium"), // MEDIUMTEXT，最大 16MB
      allowNull: false,
      comment: "文本内容（chat/thinking/error 类型使用）",
    },
    callId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: "工具调用 ID（tool_call 类型使用）",
    },
    toolName: {
      type: DataTypes.STRING(128),
      allowNull: true,
      comment: "工具名称（tool_call 类型使用）",
    },
    arguments: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "工具调用参数 JSON（tool_call 类型使用）",
    },
    result: {
      type: DataTypes.TEXT("medium"), // MEDIUMTEXT，最大 16MB
      allowNull: true,
      comment: "工具执行结果 JSON（tool_call 类型使用）",
    },
    success: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      comment: "工具执行是否成功（tool_call 类型使用）",
    },
    files: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "用户上传的文件信息 JSON（user 消息使用）",
    },
    aborted: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: "消息是否因用户中断而不完整",
    },
    outputFiles: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "工具输出文件信息 JSON（tool_call 类型使用）",
    },
  },
  {
    sequelize,
    tableName: "messages",
    timestamps: true,
  }
);

export default Message;
