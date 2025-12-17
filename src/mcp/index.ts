/**
 * MCP 连接管理模块
 * 导出所有 MCP 相关的类型、接口和管理器
 */

// 类型定义
export * from "./types.js";

// 客户端接口（使用 export type 导出 interface）
export type { IMCPClient } from "./MCPClient.js";
export { MCPClientBase } from "./MCPClient.js";

// 客户端实现
export { StdioMCPClient } from "./StdioMCPClient.js";

// 连接管理器（单例）
export { mcpManager } from "./MCPManager.js";
export { default as MCPManager } from "./MCPManager.js";

// 初始化函数
export { initMCPConnections } from "./init.js";
