/**
 * 会话模型
 * 存储用户与 AI Agent 的对话会话信息
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

// 任务状态枚举
export type TaskStatus = "running" | "completed" | "cancelled" | "waiting" | "deleted";

interface ConversationAttributes {
  id: number;
  uuid: string;
  userId: number;
  agentId: number | null;
  title: string;
  favorite: boolean;
  status: TaskStatus;
  summary: string | null;
  summaryUntilMessageId: number | null;
}

type ConversationCreationAttributes = Optional<
  ConversationAttributes,
  "id" | "title" | "favorite" | "status" | "agentId" | "summary" | "summaryUntilMessageId"
>;

class Conversation
  extends Model<ConversationAttributes, ConversationCreationAttributes>
  implements ConversationAttributes
{
  declare id: number;
  declare uuid: string;
  declare userId: number;
  declare agentId: number | null;
  declare title: string;
  declare favorite: boolean;
  declare status: TaskStatus;
  declare summary: string | null;
  declare summaryUntilMessageId: number | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Conversation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    uuid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      unique: true,
      comment: "前端生成的 UUID",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "用户 ID",
    },
    agentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: "Agent ID，null 表示无特定 Agent",
    },
    title: {
      type: DataTypes.STRING(200),
      defaultValue: "新会话",
      comment: "会话标题",
    },
    favorite: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "是否收藏",
    },
    status: {
      type: DataTypes.ENUM("running", "completed", "cancelled", "waiting", "deleted"),
      defaultValue: "running",
      comment:
        "任务状态：running-运行中, completed-已完成, cancelled-已取消, waiting-等待用户回复, deleted-已删除",
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: "历史消息总结",
    },
    summaryUntilMessageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: "总结覆盖到的最后一条消息 ID",
    },
  },
  {
    sequelize,
    tableName: "conversations",
    timestamps: true,
  }
);

export default Conversation;
