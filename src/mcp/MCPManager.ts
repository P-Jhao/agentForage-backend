/**
 * MCP 连接管理器（单例）
 * 管理所有 MCP 连接的生命周期，维护 mcpId → MCPClient 映射
 */
import { IMCPClient } from "./MCPClient.js";
import { StdioMCPClient } from "./StdioMCPClient.js";
import type { MCPClientConfig, MCPClientStatus, MCPTool, MCPToolCallResult } from "./types.js";
import { MCPConnectionError } from "./types.js";
import McpDAO from "../dao/mcpDAO.js";

/**
 * MCP 连接管理器
 * 单例模式，管理所有 MCP 客户端实例
 */
class MCPManager {
  private static instance: MCPManager;
  private clients: Map<number, IMCPClient> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  /**
   * 连接到指定 MCP
   * 如果已连接则直接返回，否则创建新连接
   * @param mcpId MCP ID
   * @returns 连接是否成功
   */
  async connect(mcpId: number): Promise<boolean> {
    // 检查是否已有连接
    const existingClient = this.clients.get(mcpId);
    if (existingClient?.isConnected()) {
      console.log(`ℹ️  MCP ${mcpId} 已连接`);
      return true;
    }

    // 从数据库获取 MCP 配置
    const mcp = await McpDAO.findById(mcpId);
    if (!mcp) {
      throw new MCPConnectionError(`MCP ${mcpId} 不存在`, mcpId);
    }

    // 构建客户端配置
    const config: MCPClientConfig = {
      id: mcp.id,
      name: mcp.name,
      transportType: mcp.transportType,
      connectionUrl: mcp.connectionUrl,
      timeout: mcp.timeout || 30,
      headers: mcp.headers || undefined,
    };

    // 根据传输类型创建客户端
    let client: IMCPClient;
    switch (config.transportType) {
      case "stdio":
        client = new StdioMCPClient(config);
        break;
      case "sse":
      case "streamableHttp":
        // TODO: 实现 SSE 和 HTTP 客户端
        throw new MCPConnectionError(`暂不支持 ${config.transportType} 传输类型`, mcpId);
      default:
        throw new MCPConnectionError(`未知的传输类型: ${config.transportType}`, mcpId);
    }

    try {
      // 连接
      await client.connect();

      // 保存客户端实例
      this.clients.set(mcpId, client);

      return true;
    } catch (error) {
      console.error(`❌ MCP ${mcpId} 连接失败:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * 断开指定 MCP 的连接
   * @param mcpId MCP ID
   */
  async disconnect(mcpId: number): Promise<void> {
    const client = this.clients.get(mcpId);
    if (client) {
      await client.disconnect();
      this.clients.delete(mcpId);
    }
  }

  /**
   * 获取指定 MCP 的工具列表
   * 如果未连接，会先尝试连接
   * @param mcpId MCP ID
   * @returns 工具列表
   */
  async getTools(mcpId: number): Promise<MCPTool[]> {
    // 确保已连接
    let client = this.clients.get(mcpId);
    if (!client?.isConnected()) {
      await this.connect(mcpId);
      client = this.clients.get(mcpId);
    }

    if (!client) {
      throw new MCPConnectionError(`无法获取 MCP ${mcpId} 的客户端`, mcpId);
    }

    return client.listTools();
  }

  /**
   * 调用指定 MCP 的工具
   * @param mcpId MCP ID
   * @param toolName 工具名称
   * @param args 工具参数
   * @returns 工具调用结果
   */
  async callTool(
    mcpId: number,
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<MCPToolCallResult> {
    // 确保已连接
    let client = this.clients.get(mcpId);
    if (!client?.isConnected()) {
      await this.connect(mcpId);
      client = this.clients.get(mcpId);
    }

    if (!client) {
      throw new MCPConnectionError(`无法获取 MCP ${mcpId} 的客户端`, mcpId);
    }

    return client.callTool(toolName, args);
  }

  /**
   * 获取指定 MCP 的连接状态
   * @param mcpId MCP ID
   * @returns 连接状态
   */
  getStatus(mcpId: number): MCPClientStatus {
    const client = this.clients.get(mcpId);
    return client?.status || "disconnected";
  }

  /**
   * 检查指定 MCP 是否已连接
   * @param mcpId MCP ID
   */
  isConnected(mcpId: number): boolean {
    const client = this.clients.get(mcpId);
    return client?.isConnected() || false;
  }

  /**
   * 断开所有 MCP 连接
   * 用于服务关闭时清理资源
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];

    for (const [mcpId, client] of this.clients) {
      console.log(`ℹ️  断开 MCP ${mcpId} 连接...`);
      disconnectPromises.push(client.disconnect());
    }

    await Promise.all(disconnectPromises);
    this.clients.clear();
    console.log("✅ 所有 MCP 连接已断开");
  }

  /**
   * 获取所有已连接的 MCP ID 列表
   */
  getConnectedMcpIds(): number[] {
    const connectedIds: number[] = [];
    for (const [mcpId, client] of this.clients) {
      if (client.isConnected()) {
        connectedIds.push(mcpId);
      }
    }
    return connectedIds;
  }
}

// 导出单例
export const mcpManager = MCPManager.getInstance();
export default mcpManager;
