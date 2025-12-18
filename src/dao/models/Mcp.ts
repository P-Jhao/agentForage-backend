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
// connected: 连通成功
// disconnected: 连通失败（可重连）
// closed: 管理员主动关闭（普通用户不可见）
export type McpStatus = "connected" | "disconnected" | "closed";

// MCP 属性接口
export interface McpAttributes {
  id: number;
  name: string; // MCP 名称（必选）
  description: string | null; // MCP 描述（可选）
  transportType: McpTransportType; // 传输方式（必选）
  // stdio 类型使用 command + args + env
  command: string | null; // 启动命令（stdio 类型必选）
  args: string | null; // 命令参数（stdio 类型可选，JSON 数组格式）
  env: string | null; // 环境变量（stdio 类型可选，JSON 对象格式）
  // sse/streamableHttp 类型使用 url + headers
  url: string | null; // 连接地址（sse/streamableHttp 类型必选）
  userId: number; // 创建者 ID
  source: McpSource; // 来源（固定为 builtin）
  isPublic: boolean; // 是否公开（固定为 true）
  timeout: number | null; // 超时时间（秒，可选）
  headers: string | null; // 请求头（JSON 字符串，可选，用于 sse/http）
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
  | "command"
  | "args"
  | "env"
  | "url"
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
  declare command: string | null;
  declare args: string | null;
  declare env: string | null;
  declare url: string | null;
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
    command: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "启动命令（stdio 类型使用）",
    },
    args: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "命令参数（stdio 类型使用，JSON 数组格式）",
    },
    env: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "环境变量（stdio 类型使用，JSON 对象格式）",
    },
    url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "连接地址（sse/streamableHttp 类型使用）",
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
      type: DataTypes.ENUM("connected", "disconnected", "closed"),
      allowNull: false,
      defaultValue: "disconnected",
      comment: "连接状态：connected（连通成功）/ disconnected（连通失败）/ closed（管理员关闭）",
    },
  },
  {
    sequelize,
    tableName: "mcps",
    timestamps: true,
  }
);

export default Mcp;
