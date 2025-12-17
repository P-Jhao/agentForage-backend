/**
 * Agent 配置模型
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

interface AgentAttributes {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  systemPrompt: string | null;
  model: "qwen" | "deepseek";
  isActive: boolean;
  // Forge 模块新增字段
  userId: number; // 创建者 ID
  source: "builtin" | "user"; // 来源类型：内置 / 用户创建
  avatar: string | null; // 头像（emoji 或 URL）
  usageCount: number; // 使用次数
  isPublic: boolean; // 是否公开（广场可见）
}

type AgentCreationAttributes = Optional<
  AgentAttributes,
  | "id"
  | "description"
  | "systemPrompt"
  | "model"
  | "isActive"
  | "source"
  | "avatar"
  | "usageCount"
  | "isPublic"
>;

class Agent extends Model<AgentAttributes, AgentCreationAttributes> implements AgentAttributes {
  declare id: number;
  declare name: string;
  declare displayName: string;
  declare description: string | null;
  declare systemPrompt: string | null;
  declare model: "qwen" | "deepseek";
  declare isActive: boolean;
  declare userId: number;
  declare source: "builtin" | "user";
  declare avatar: string | null;
  declare usageCount: number;
  declare isPublic: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Agent.init(
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
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "创建者 ID",
    },
    source: {
      type: DataTypes.ENUM("builtin", "user"),
      defaultValue: "user",
      comment: "来源类型：builtin 内置 / user 用户创建",
    },
    avatar: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "头像（emoji 或 URL）",
    },
    usageCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "使用次数",
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "是否公开（广场可见）",
    },
  },
  {
    sequelize,
    tableName: "agents",
    timestamps: true,
  }
);

export default Agent;
