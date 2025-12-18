/**
 * MCP 连接管理相关类型定义
 * 用于 MCP Server 的连接、通信和工具调用
 */

// ==================== JSON-RPC 2.0 协议类型 ====================

/**
 * JSON-RPC 请求
 */
export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 成功响应
 */
export interface JSONRPCSuccessResponse {
  jsonrpc: "2.0";
  id: number;
  result: unknown;
}

/**
 * JSON-RPC 错误对象
 */
export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 错误响应
 */
export interface JSONRPCErrorResponse {
  jsonrpc: "2.0";
  id: number;
  error: JSONRPCError;
}

/**
 * JSON-RPC 响应（成功或错误）
 */
export type JSONRPCResponse = JSONRPCSuccessResponse | JSONRPCErrorResponse;

// ==================== MCP 工具相关类型 ====================

/**
 * MCP 工具的输入参数 Schema
 * 遵循 JSON Schema 格式
 */
export interface MCPToolInputSchema {
  type: "object";
  properties?: Record<
    string,
    {
      type: string;
      description?: string;
      enum?: string[];
      default?: unknown;
    }
  >;
  required?: string[];
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: MCPToolInputSchema;
}

/**
 * MCP 工具调用结果
 */
export interface MCPToolCallResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ==================== MCP 客户端配置类型 ====================

/**
 * MCP 客户端连接状态
 */
export type MCPClientStatus = "connected" | "disconnected" | "connecting" | "error";

/**
 * MCP 传输类型
 */
export type MCPTransportType = "stdio" | "sse" | "streamableHttp";

/**
 * MCP 客户端配置
 */
export interface MCPClientConfig {
  id: number; // MCP ID（数据库主键）
  name: string; // MCP 名称
  transportType: MCPTransportType; // 传输类型
  // stdio 类型使用
  command?: string; // 启动命令
  args?: string[]; // 命令参数（数组）
  env?: Record<string, string>; // 环境变量（对象）
  // sse/streamableHttp 类型使用
  url?: string; // 连接地址
  headers?: Record<string, string>; // 请求头（对象）
  timeout?: number; // 超时时间（秒）
}

// ==================== MCP 协议消息类型 ====================

/**
 * MCP initialize 请求参数
 */
export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: {
    roots?: { listChanged?: boolean };
    sampling?: Record<string, unknown>;
  };
  clientInfo: {
    name: string;
    version: string;
  };
}

/**
 * MCP initialize 响应结果
 */
export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: { listChanged?: boolean };
    resources?: { subscribe?: boolean; listChanged?: boolean };
    prompts?: { listChanged?: boolean };
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

/**
 * MCP tools/list 响应结果
 */
export interface MCPToolsListResult {
  tools: MCPTool[];
}

/**
 * MCP tools/call 请求参数
 */
export interface MCPToolsCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

// ==================== 错误类型 ====================

/**
 * MCP 连接错误
 */
export class MCPConnectionError extends Error {
  constructor(
    message: string,
    public readonly mcpId: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "MCPConnectionError";
  }
}

/**
 * MCP 超时错误
 */
export class MCPTimeoutError extends Error {
  constructor(
    message: string,
    public readonly mcpId: number,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = "MCPTimeoutError";
  }
}

/**
 * MCP 工具调用错误
 */
export class MCPToolCallError extends Error {
  constructor(
    message: string,
    public readonly mcpId: number,
    public readonly toolName: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "MCPToolCallError";
  }
}
