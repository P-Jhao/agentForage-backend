/**
 * 消息模型
 */
import { DataTypes } from "sequelize";
import { sequelize } from "../../config/database.js";

const Message = sequelize.define(
  "Message",
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
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "消息内容",
    },
  },
  {
    tableName: "messages",
    timestamps: true,
  }
);

export default Message;
