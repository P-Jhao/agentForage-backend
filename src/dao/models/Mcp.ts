/**
 * MCP 模型
 * MCP（Model Context Protocol）用于集成 LLM 工具
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

// MCP 传输方式类型
export type McpTransportType = "stdio" | "sse" | "streamableHttp";

// MCP 来源类型（固定为 builtin）
export type McpSource = "builtin";

// MCP 连接状态
export type McpStatus = "connected" | "disconnected";

// MCP 属性接口
export interface McpAttributes {
  id: number;
  name: string; // MCP 名称（必选）
  description: string | null; // MCP 描述（可选）
  transportType: McpTransportType; // 传输方式（必选）
  connectionUrl: string; // 连接地址（必选）
  userId: number; // 创建者 ID
  source: McpSource; // 来源（固定为 builtin）
  isPublic: boolean; // 是否公开（固定为 true）
  timeout: number | null; // 超时时间（秒，可选）
  headers: string | null; // 请求头（JSON 字符串，可选）
  remarks: string | null; // 备注（可选）
  example: string | null; // MCP 示例（可选）
  status: McpStatus; // 连接状态
  createdAt?: Date;
  updatedAt?: Date;
}

// MCP 创建属性（id、status、source、isPublic 等有默认值）
export type McpCreationAttributes = Optional<
  McpAttributes,
  | "id"
  | "status"
  | "source"
  | "isPublic"
  | "description"
  | "timeout"
  | "headers"
  | "remarks"
  | "example"
>;

class Mcp extends Model<McpAttributes, McpCreationAttributes> implements McpAttributes {
  declare id: number;
  declare name: string;
  declare description: string | null;
  declare transportType: McpTransportType;
  declare connectionUrl: string;
  declare userId: number;
  declare source: McpSource;
  declare isPublic: boolean;
  declare timeout: number | null;
  declare headers: string | null;
  declare remarks: string | null;
  declare example: string | null;
  declare status: McpStatus;
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
    transportType: {
      type: DataTypes.ENUM("stdio", "sse", "streamableHttp"),
      allowNull: false,
      comment: "传输方式：stdio / sse / streamableHttp",
    },
    connectionUrl: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: "连接地址（URL 或本地路径）",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "创建者 ID",
    },
    source: {
      type: DataTypes.ENUM("builtin"),
      allowNull: false,
      defaultValue: "builtin",
      comment: "来源（固定为 builtin）",
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "是否公开（固定为 true）",
    },
    timeout: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 30,
      comment: "超时时间（秒）",
    },
    headers: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "请求头（JSON 字符串）",
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "备注",
    },
    example: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "MCP 示例（使用说明）",
    },
    status: {
      type: DataTypes.ENUM("connected", "disconnected"),
      allowNull: false,
      defaultValue: "disconnected",
      comment: "连接状态：connected / disconnected",
    },
  },
  {
    sequelize,
    tableName: "mcps",
    timestamps: true,
  }
);

export default Mcp;
