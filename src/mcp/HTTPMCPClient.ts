/**
 * HTTP MCP 客户端实现
 * 支持 SSE 和 StreamableHTTP 两种传输方式
 * 使用官方 SDK 通过 HTTP 与 MCP Server 通信
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCPClientBase } from "./MCPClient.js";
import type { MCPClientConfig, MCPTool, MCPToolCallResult } from "./types.js";

/**
 * HTTP MCP 客户端
 * 通过 SSE 或 StreamableHTTP 与 MCP Server 通信
 */
// 心跳检测间隔（毫秒）
const HEARTBEAT_INTERVAL = 30000; // 30 秒

export class HTTPMCPClient extends MCPClientBase {
  private client: Client | null = null;
  private transport: SSEClientTransport | StreamableHTTPClientTransport | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: MCPClientConfig) {
    super(config);
    // TODO: 初始化 client 和 transport
    const { transportType, url, headers, name } = config;

    this.client = new Client({
      version: "1.0.0",
      name: `AgentForge-${name}`,
    });

    const transportUrl = new URL(url!);
    const transportOption = headers ? { requestInit: { headers } } : undefined;

    this.transport =
      transportType === "streamableHttp"
        ? new StreamableHTTPClientTransport(transportUrl, transportOption)
        : new SSEClientTransport(transportUrl, transportOption);
  }

  /**
   * 连接到 MCP Server
   */
  async connect(): Promise<void> {
    await this.client?.connect(this.transport!);
    this._status = "connected";

    // 监听连接关闭事件
    this.transport!.onclose = () => {
      this.stopHeartbeat();
      this.handleDisconnect();
    };

    // 监听错误事件
    this.transport!.onerror = (error) => {
      console.error(`❌ MCP ${this._config.id} 传输错误:`, error);
      this.stopHeartbeat();
      this.handleDisconnect();
    };

    // 启动心跳检测（HTTP 是无状态的，需要主动检测连接状态）
    this.startHeartbeat();
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    await this.client?.close();
    this._status = "disconnected";
  }

  /**
   * 启动心跳检测
   * 定期调用 ping 检测连接是否存活
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.client?.ping();
      } catch (error) {
        console.log(`💔 MCP ${this._config.id} (${this._config.name}) 心跳检测失败`);
        this.stopHeartbeat();
        this.handleDisconnect();
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * 停止心跳检测
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 获取工具列表
   */
  async listTools(): Promise<MCPTool[]> {
    try {
      const result = await this.client?.listTools();
      return (result?.tools as MCPTool[]) || [];
    } catch (error) {
      // 操作失败，可能连接已断开
      this.handleDisconnect();
      throw error;
    }
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args?: Record<string, unknown>): Promise<MCPToolCallResult> {
    try {
      const result = await this.client?.callTool({
        name,
        arguments: args,
      });
      return {
        content: (result?.content as MCPToolCallResult["content"]) || [],
        isError: result?.isError as boolean | undefined,
      };
    } catch (error) {
      // 操作失败，可能连接已断开
      this.handleDisconnect();
      throw error;
    }
  }
}
