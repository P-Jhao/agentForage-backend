/**
 * MCP 模型
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

// MCP 来源类型
export type McpSource = "official" | "community" | "custom";

// MCP 状态
export type McpStatus = "online" | "offline";

interface McpAttributes {
  id: number;
  name: string;
  description: string;
  author: string;
  source: McpSource;
  status: McpStatus;
  tools: string[];
  userId: number; // 所属用户ID，官方为 -1
}

type McpCreationAttributes = Optional<McpAttributes, "id" | "status">;

class Mcp extends Model<McpAttributes, McpCreationAttributes> implements McpAttributes {
  declare id: number;
  declare name: string;
  declare description: string;
  declare author: string;
  declare source: McpSource;
  declare status: McpStatus;
  declare tools: string[];
  declare userId: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Mcp.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "MCP 名称",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "MCP 描述",
    },
    author: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: "作者",
    },
    source: {
      type: DataTypes.ENUM("official", "community", "custom"),
      allowNull: false,
      comment: "来源：官方/社区/自定义",
    },
    status: {
      type: DataTypes.ENUM("online", "offline"),
      defaultValue: "offline",
      comment: "状态：在线/离线",
    },
    tools: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: "工具列表",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "所属用户ID，官方为 -1",
    },
  },
  {
    sequelize,
    tableName: "mcps",
    timestamps: true,
  }
);

export default Mcp;
