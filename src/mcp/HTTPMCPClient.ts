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
export class HTTPMCPClient extends MCPClientBase {
  private client: Client | null = null;
  private transport: SSEClientTransport | StreamableHTTPClientTransport | null = null;

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
      this.handleDisconnect();
    };

    // 监听错误事件
    this.transport!.onerror = (error) => {
      console.error(`❌ MCP ${this._config.id} 传输错误:`, error);
      this.handleDisconnect();
    };
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    await this.client?.close();
    this._status = "disconnected";
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
