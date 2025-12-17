/**
 * 内置 MCP 配置
 * 定义 stdio 类型的内置 MCP 列表
 * 这些 MCP 在系统初始化时自动创建
 */
import type { McpCreationAttributes } from "../dao/models/Mcp.js";

// 内置 MCP 配置（不包含 userId，初始化时会设置为管理员 ID）
export type BuiltinMcpConfig = Omit<McpCreationAttributes, "userId">;

/**
 * 内置 MCP 列表
 * TODO: 后续根据实际需求添加真实的 MCP 配置
 */
export const builtinMcps: BuiltinMcpConfig[] = [
  {
    name: "文件系统 MCP",
    description: "提供文件系统操作能力，包括读取、写入、列出目录等功能",
    transportType: "stdio",
    connectionUrl: "npx -y @anthropic/mcp-server-filesystem",
    timeout: 30,
    example: `// 使用示例
// 列出目录内容
await mcp.call("list_directory", { path: "/home/user" });

// 读取文件
await mcp.call("read_file", { path: "/home/user/example.txt" });`,
    remarks: "需要配置允许访问的目录路径",
  },
  {
    name: "网页搜索 MCP",
    description: "提供网页搜索能力，支持多种搜索引擎",
    transportType: "stdio",
    connectionUrl: "npx -y @anthropic/mcp-server-brave-search",
    timeout: 60,
    example: `// 使用示例
// 搜索网页
await mcp.call("brave_web_search", { query: "TypeScript 最佳实践" });`,
    remarks: "需要配置 BRAVE_API_KEY 环境变量",
  },
  {
    name: "数据库查询 MCP",
    description: "提供 PostgreSQL 数据库查询能力",
    transportType: "stdio",
    connectionUrl: "npx -y @anthropic/mcp-server-postgres",
    timeout: 30,
    example: `// 使用示例
// 执行 SQL 查询
await mcp.call("query", { sql: "SELECT * FROM users LIMIT 10" });`,
    remarks: "需要配置数据库连接字符串",
  },
];

/**
 * 初始化内置 MCP
 * 在数据库同步后调用，如果不存在则创建
 * @param adminUserId 管理员用户 ID
 */
export const initBuiltinMcps = async (adminUserId: number): Promise<void> => {
  try {
    // 动态导入 Mcp 模型，避免循环依赖
    const { Mcp } = await import("../dao/models/index.js");

    for (const mcpConfig of builtinMcps) {
      // 检查是否已存在同名 MCP
      const existing = await Mcp.findOne({
        where: { name: mcpConfig.name },
      });

      if (existing) {
        console.log(`ℹ️  内置 MCP "${mcpConfig.name}" 已存在`);
        continue;
      }

      // 创建内置 MCP
      await Mcp.create({
        ...mcpConfig,
        userId: adminUserId,
        source: "builtin",
        isPublic: true,
        status: "disconnected",
      });
      console.log(`✅ 内置 MCP "${mcpConfig.name}" 创建成功`);
    }
  } catch (error) {
    console.error("❌ 初始化内置 MCP 失败:", (error as Error).message);
  }
};
