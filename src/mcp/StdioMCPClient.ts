/**
 * Stdio MCP 客户端实现
 * 通过 child_process 启动 MCP Server 进程，使用 stdin/stdout 进行 JSON-RPC 通信
 */
import { spawn, ChildProcess } from "child_process";
import { MCPClientBase } from "./MCPClient.js";
import type {
  MCPClientConfig,
  MCPTool,
  MCPToolCallResult,
  JSONRPCRequest,
  JSONRPCResponse,
  MCPInitializeResult,
  MCPToolsListResult,
} from "./types.js";
import { MCPConnectionError, MCPTimeoutError, MCPToolCallError } from "./types.js";

/**
 * 等待中的请求
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Stdio MCP 客户端
 * 通过子进程与 MCP Server 通信
 */
export class StdioMCPClient extends MCPClientBase {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private buffer = "";
  private tools: MCPTool[] = [];

  constructor(config: MCPClientConfig) {
    super(config);
  }

  /**
   * 连接到 MCP Server
   * 启动子进程并完成初始化握手
   */
  async connect(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    this._status = "connecting";

    try {
      // 启动子进程
      await this.spawnProcess();

      // 发送 initialize 请求
      await this.initialize();

      // 发送 initialized 通知
      await this.sendNotification("notifications/initialized", {});

      this._status = "connected";
      console.log(`✅ MCP "${this._config.name}" 连接成功`);
    } catch (error) {
      this._status = "error";
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 断开连接
   * 终止子进程并清理资源
   */
  async disconnect(): Promise<void> {
    await this.cleanup();
    this._status = "disconnected";
    console.log(`ℹ️  MCP "${this._config.name}" 已断开连接`);
  }

  /**
   * 获取工具列表
   */
  async listTools(): Promise<MCPTool[]> {
    this.ensureConnected();

    // 如果已缓存工具列表，直接返回
    if (this.tools.length > 0) {
      console.log(`[MCP ${this._config.name}] 返回缓存的工具列表: ${this.tools.length} 个工具`);
      return this.tools;
    }

    console.log(`[MCP ${this._config.name}] 请求工具列表...`);
    const result = await this.sendRequest<MCPToolsListResult>("tools/list", {});
    console.log(`[MCP ${this._config.name}] 工具列表响应:`, JSON.stringify(result));
    this.tools = result.tools || [];
    console.log(`[MCP ${this._config.name}] 获取到 ${this.tools.length} 个工具`);
    return this.tools;
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args?: Record<string, unknown>): Promise<MCPToolCallResult> {
    this.ensureConnected();

    try {
      const result = await this.sendRequest<MCPToolCallResult>("tools/call", {
        name,
        arguments: args || {},
      });
      return result;
    } catch (error) {
      throw new MCPToolCallError(
        `工具调用失败: ${(error as Error).message}`,
        this._config.id,
        name,
        error as Error
      );
    }
  }

  /**
   * 启动子进程
   */
  private async spawnProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = this._config.connectionUrl;
      const timeout = (this._config.timeout || 30) * 1000;

      console.log(`🚀 启动 MCP Server: ${command}`);

      // 解析命令和参数
      const parts = command.split(" ");
      const cmd = parts[0];
      const args = parts.slice(1);

      // 启动子进程
      this.process = spawn(cmd, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
      });

      // 设置启动超时
      const timer = setTimeout(() => {
        reject(new MCPTimeoutError(`MCP Server 启动超时`, this._config.id, timeout));
        this.cleanup();
      }, timeout);

      // 监听 stdout
      this.process.stdout?.on("data", (data: Buffer) => {
        this.handleStdout(data);
      });

      // 监听 stderr（用于调试）
      this.process.stderr?.on("data", (data: Buffer) => {
        console.error(`[MCP ${this._config.name}] stderr:`, data.toString());
      });

      // 监听进程退出
      this.process.on("exit", (code, signal) => {
        console.log(`[MCP ${this._config.name}] 进程退出: code=${code}, signal=${signal}`);
        this._status = "disconnected";
        this.rejectAllPending(new MCPConnectionError(`MCP Server 进程意外退出`, this._config.id));
      });

      // 监听进程错误
      this.process.on("error", (error) => {
        clearTimeout(timer);
        reject(
          new MCPConnectionError(`MCP Server 启动失败: ${error.message}`, this._config.id, error)
        );
      });

      // 进程启动成功（spawn 事件）
      this.process.on("spawn", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * 发送 initialize 请求
   */
  private async initialize(): Promise<MCPInitializeResult> {
    const result = await this.sendRequest<MCPInitializeResult>("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: { listChanged: true },
      },
      clientInfo: {
        name: "AgentForge",
        version: "1.0.0",
      },
    });
    return result;
  }

  /**
   * 发送 JSON-RPC 请求
   */
  private sendRequest<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new MCPConnectionError("进程未启动", this._config.id));
        return;
      }

      const id = ++this.requestId;
      const timeout = (this._config.timeout || 30) * 1000;

      const request: JSONRPCRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      // 设置超时
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new MCPTimeoutError(`请求超时: ${method}`, this._config.id, timeout));
      }, timeout);

      // 保存等待中的请求
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      // 发送请求
      const message = JSON.stringify(request) + "\n";
      this.process.stdin.write(message);
    });
  }

  /**
   * 发送 JSON-RPC 通知（无需响应）
   */
  private sendNotification(method: string, params: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new MCPConnectionError("进程未启动", this._config.id));
        return;
      }

      const notification = {
        jsonrpc: "2.0",
        method,
        params,
      };

      const message = JSON.stringify(notification) + "\n";
      this.process.stdin.write(message, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 处理 stdout 数据
   */
  private handleStdout(data: Buffer): void {
    this.buffer += data.toString();

    // 按行分割处理
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        this.handleMessage(line);
      }
    }
  }

  /**
   * 处理 JSON-RPC 消息
   */
  private handleMessage(message: string): void {
    try {
      const response = JSON.parse(message) as JSONRPCResponse;

      // 检查是否是响应消息
      if ("id" in response && response.id !== undefined) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(response.id);

          if ("error" in response) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      }
    } catch {
      console.error(`[MCP ${this._config.name}] 解析消息失败:`, message);
    }
  }

  /**
   * 确保已连接
   */
  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new MCPConnectionError(`MCP "${this._config.name}" 未连接`, this._config.id);
    }
  }

  /**
   * 拒绝所有等待中的请求
   */
  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    // 拒绝所有等待中的请求
    this.rejectAllPending(new MCPConnectionError("连接已关闭", this._config.id));

    // 终止子进程
    if (this.process) {
      this.process.stdin?.end();
      this.process.kill();
      this.process = null;
    }

    // 清空缓存
    this.buffer = "";
    this.tools = [];
  }
}
