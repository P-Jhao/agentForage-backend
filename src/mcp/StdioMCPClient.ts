/**
 * Stdio MCP 客户端实现
 * 使用官方 SDK 通过 child_process 与 MCP Server 通信
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCPClientBase } from "./MCPClient.js";
import type { MCPClientConfig, MCPTool, MCPToolCallResult } from "./types.js";

/**
 * Stdio MCP 客户端
 * 通过子进程与 MCP Server 通信
 */
export class StdioMCPClient extends MCPClientBase {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  constructor(config: MCPClientConfig) {
    super(config);

    this.client = new Client({
      name: "McpClient",
      version: "1.0.0",
    });

    this.transport = new StdioClientTransport({
      command: config.command!,
      args: config.args,
    });
  }

  /**
   * 连接到 MCP Server
   * TODO: 实现连接逻辑
   */
  async connect(): Promise<void> {
    // TODO: 实现
    await this.client?.connect(this.transport!);
    this._status = "connected";
  }

  /**
   * 断开连接
   * TODO: 实现断开逻辑
   */
  async disconnect(): Promise<void> {
    // TODO: 实现
    this.client?.close();
    this._status = "disconnected";
  }

  /**
   * 获取工具列表
   */
  async listTools(): Promise<MCPTool[]> {
    const result = await this.client?.listTools();
    return (result?.tools as MCPTool[]) || [];
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args?: Record<string, unknown>): Promise<MCPToolCallResult> {
    const result = await this.client?.callTool({
      name,
      arguments: args,
    });
    return {
      content: (result?.content as MCPToolCallResult["content"]) || [],
      isError: result?.isError as boolean | undefined,
    };
  }
}
