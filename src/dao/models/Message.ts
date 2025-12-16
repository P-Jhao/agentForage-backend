/**
 * 消息模型
 * 存储对话中的单条消息记录
 *
 * 存储格式：
 * - user 消息：content 为纯字符串
 * - assistant 消息：content 为 JSON 数组 [{type, content}, ...]
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

// 消息角色类型
export type MessageRole = "user" | "assistant" | "system";

// 消息段落类型（LLM 输出的不同阶段）
export type MessageType = "thinking" | "chat" | "tool" | "error";

// 消息段落（assistant 消息的数组元素）
export interface MessageSegment {
  type: MessageType;
  content: string;
}

interface MessageAttributes {
  id: number;
  conversationId: number;
  role: MessageRole;
  content: string; // user: 纯字符串; assistant: JSON 数组字符串
}

type MessageCreationAttributes = Optional<MessageAttributes, "id">;

class Message
  extends Model<MessageAttributes, MessageCreationAttributes>
  implements MessageAttributes
{
  declare id: number;
  declare conversationId: number;
  declare role: MessageRole;
  declare content: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * 获取解析后的内容
   * user 消息返回字符串，assistant 消息返回段落数组
   */
  getParsedContent(): string | MessageSegment[] {
    if (this.role === "assistant") {
      try {
        return JSON.parse(this.content) as MessageSegment[];
      } catch {
        // 兼容旧数据，返回单个 chat 段落
        return [{ type: "chat", content: this.content }];
      }
    }
    return this.content;
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
      comment: "消息角色：user-用户, assistant-AI助手, system-系统",
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "消息内容：user 为纯字符串，assistant 为 JSON 数组",
    },
  },
  {
    sequelize,
    tableName: "messages",
    timestamps: true,
  }
);

export default Message;
