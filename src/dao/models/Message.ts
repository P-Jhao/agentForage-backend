/**
 * 消息模型
 * 存储对话中的单条消息记录
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

// 消息角色类型
export type MessageRole = "user" | "assistant" | "system" | "tool";

// 消息类型（LLM 输出的不同阶段）
export type MessageType = "thinking" | "chat" | "tool" | "error";

interface MessageAttributes {
  id: number;
  conversationId: number;
  role: MessageRole;
  type: MessageType;
  content: string;
}

type MessageCreationAttributes = Optional<MessageAttributes, "id" | "type">;

class Message
  extends Model<MessageAttributes, MessageCreationAttributes>
  implements MessageAttributes
{
  declare id: number;
  declare conversationId: number;
  declare role: MessageRole;
  declare type: MessageType;
  declare content: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
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
      type: DataTypes.ENUM("user", "assistant", "system", "tool"),
      allowNull: false,
      comment: "消息角色：user-用户, assistant-AI助手, system-系统, tool-工具",
    },
    type: {
      type: DataTypes.STRING(20),
      defaultValue: "chat",
      comment: "消息类型：thinking-思考链, chat-对话, tool-工具调用, error-错误",
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "消息内容",
    },
  },
  {
    sequelize,
    tableName: "messages",
    timestamps: true,
  }
);

export default Message;
