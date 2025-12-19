/**
 * MCP-Forge 关联模型
 * 用于存储 MCP 与 Forge 的多对多关系，支持工具级别的选择
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

/**
 * 工具信息接口
 * 存储选中的工具详细信息，用于 LLM 绑定
 */
export interface ToolInfo {
  name: string; // 工具名称
  description: string; // 工具描述
  inputSchema: Record<string, unknown>; // 工具参数 JSON Schema
}

// MCPForge 属性接口
export interface McpForgeAttributes {
  id: number;
  mcpId: number; // MCP ID
  forgeId: number; // Forge ID
  tools: ToolInfo[]; // 选中的工具列表
  createdAt?: Date;
}

// MCPForge 创建属性
export type McpForgeCreationAttributes = Optional<McpForgeAttributes, "id" | "tools">;

class McpForge
  extends Model<McpForgeAttributes, McpForgeCreationAttributes>
  implements McpForgeAttributes
{
  declare id: number;
  declare mcpId: number;
  declare forgeId: number;
  declare tools: ToolInfo[];
  declare readonly createdAt: Date;
}

McpForge.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    mcpId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "MCP ID",
      references: {
        model: "mcps",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    forgeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Forge ID",
      references: {
        model: "agents",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    tools: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: "选中的工具列表，格式: [{name, description, inputSchema}]",
    },
  },
  {
    sequelize,
    tableName: "mcp_forge",
    timestamps: true,
    updatedAt: false, // 只需要 createdAt
    indexes: [
      {
        unique: true,
        fields: ["mcp_id", "forge_id"],
        name: "unique_mcp_forge",
      },
      {
        fields: ["forge_id"],
        name: "idx_forge_id",
      },
    ],
  }
);

export default McpForge;
