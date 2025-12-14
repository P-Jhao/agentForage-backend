/**
 * 会话模型
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

interface ConversationAttributes {
  id: number;
  userId: number;
  agentId: number;
  title: string;
}

type ConversationCreationAttributes = Optional<ConversationAttributes, "id" | "title">;

class Conversation
  extends Model<ConversationAttributes, ConversationCreationAttributes>
  implements ConversationAttributes
{
  declare id: number;
  declare userId: number;
  declare agentId: number;
  declare title: string;
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
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "用户 ID",
    },
    agentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Agent ID",
    },
    title: {
      type: DataTypes.STRING(200),
      defaultValue: "新会话",
      comment: "会话标题",
    },
  },
  {
    sequelize,
    tableName: "conversations",
    timestamps: true,
  }
);

export default Conversation;
