/**
 * MCP 客户端抽象接口
 * 定义所有 MCP 客户端实现必须遵循的接口
 */
import type { MCPClientConfig, MCPClientStatus, MCPTool, MCPToolCallResult } from "./types.js";

/**
 * MCP 客户端接口
 * 所有传输类型的客户端都必须实现此接口
 */
export interface IMCPClient {
  /**
   * 获取客户端配置
   */
  readonly config: MCPClientConfig;

  /**
   * 获取当前连接状态
   */
  readonly status: MCPClientStatus;

  /**
   * 连接到 MCP Server
   * @throws MCPConnectionError 连接失败时抛出
   * @throws MCPTimeoutError 连接超时时抛出
   */
  connect(): Promise<void>;

  /**
   * 断开与 MCP Server 的连接
   */
  disconnect(): Promise<void>;

  /**
   * 检查是否已连接
   */
  isConnected(): boolean;

  /**
   * 获取 MCP Server 提供的工具列表
   * @returns 工具列表
   * @throws MCPConnectionError 未连接时抛出
   */
  listTools(): Promise<MCPTool[]>;

  /**
   * 调用 MCP 工具
   * @param name 工具名称
   * @param args 工具参数
   * @returns 工具调用结果
   * @throws MCPConnectionError 未连接时抛出
   * @throws MCPToolCallError 工具调用失败时抛出
   */
  callTool(name: string, args?: Record<string, unknown>): Promise<MCPToolCallResult>;
}

/**
 * MCP 客户端抽象基类
 * 提供通用的状态管理和配置存储
 */
export abstract class MCPClientBase implements IMCPClient {
  protected _status: MCPClientStatus = "disconnected";
  protected _config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this._config = config;
  }

  get config(): MCPClientConfig {
    return this._config;
  }

  get status(): MCPClientStatus {
    return this._status;
  }

  isConnected(): boolean {
    return this._status === "connected";
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract listTools(): Promise<MCPTool[]>;
  abstract callTool(name: string, args?: Record<string, unknown>): Promise<MCPToolCallResult>;
}
