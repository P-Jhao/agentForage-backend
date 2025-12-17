/**
 * MCP-Forge 关联模型
 * 用于存储 MCP 与 Forge 的多对多关系
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

// MCPForge 属性接口
export interface McpForgeAttributes {
  id: number;
  mcpId: number; // MCP ID
  forgeId: number; // Forge ID
  createdAt?: Date;
}

// MCPForge 创建属性
export type McpForgeCreationAttributes = Optional<McpForgeAttributes, "id">;

class McpForge
  extends Model<McpForgeAttributes, McpForgeCreationAttributes>
  implements McpForgeAttributes
{
  declare id: number;
  declare mcpId: number;
  declare forgeId: number;
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
