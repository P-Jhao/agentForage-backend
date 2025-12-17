/**
 * Agent 配置模型（Forge）
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

interface AgentAttributes {
  id: number;
  displayName: string;
  description: string | null;
  systemPrompt: string | null;
  isActive: boolean;
  // Forge 模块字段
  userId: number; // 创建者 ID
  source: "builtin" | "user"; // 来源类型：内置 / 用户创建
  avatar: string | null; // 头像（emoji 或 URL）
  usageCount: number; // 使用次数
  isPublic: boolean; // 是否公开（广场可见）
  summary: string | null; // AI 生成的能力摘要（用于自动匹配）
}

type AgentCreationAttributes = Optional<
  AgentAttributes,
  | "id"
  | "description"
  | "systemPrompt"
  | "isActive"
  | "source"
  | "avatar"
  | "usageCount"
  | "isPublic"
  | "summary"
>;

class Agent extends Model<AgentAttributes, AgentCreationAttributes> implements AgentAttributes {
  declare id: number;
  declare displayName: string;
  declare description: string | null;
  declare systemPrompt: string | null;
  declare isActive: boolean;
  declare userId: number;
  declare source: "builtin" | "user";
  declare avatar: string | null;
  declare usageCount: number;
  declare isPublic: boolean;
  declare summary: string | null;
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
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "显示名称，如 代码安全审计",
    },
    description: {
      type: DataTypes.TEXT,
      comment: "Forge 介绍（Markdown）",
    },
    systemPrompt: {
      type: DataTypes.TEXT,
      comment: "系统提示词",
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
    summary: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "AI 生成的能力摘要（用于自动匹配 Forge）",
    },
  },
  {
    sequelize,
    tableName: "agents",
    timestamps: true,
  }
);

export default Agent;
