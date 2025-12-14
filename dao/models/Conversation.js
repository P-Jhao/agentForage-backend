/**
 * 会话模型
 */
import { DataTypes } from "sequelize";
import { sequelize } from "../../config/database.js";

const Conversation = sequelize.define(
  "Conversation",
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
    tableName: "conversations",
    timestamps: true,
  }
);

export default Conversation;
