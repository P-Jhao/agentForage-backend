/**
 * Agent 配置模型
 */
import { DataTypes } from "sequelize";
import { sequelize } from "../../config/database.js";

const Agent = sequelize.define(
  "Agent",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: "Agent 标识名，如 code-audit",
    },
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "显示名称，如 代码安全审计",
    },
    description: {
      type: DataTypes.TEXT,
      comment: "Agent 描述",
    },
    systemPrompt: {
      type: DataTypes.TEXT,
      comment: "系统提示词",
    },
    model: {
      type: DataTypes.ENUM("qwen", "deepseek"),
      defaultValue: "qwen",
      comment: "使用的模型",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "是否启用",
    },
  },
  {
    tableName: "agents",
    timestamps: true,
  }
);

export default Agent;
