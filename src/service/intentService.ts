/**
 * 意图分析服务
 * 处理智能路由相关的业务逻辑
 */
import ForgeService from "./forgeService.js";
import McpDAO from "../dao/mcpDAO.js";
import { mcpManager, type MCPTool } from "../mcp/index.js";

// 动态导入 Gateway
const loadGateway = async () => {
  return await import("agentforge-gateway");
};

// MCP 工具信息（用于意图分析）
interface MCPToolInfo {
  name: string;
  description: string;
}

// MCP 信息（用于意图分析）
interface MCPInfo {
  id: number;
  name: string;
  tools: MCPToolInfo[];
}

// Forge 分析请求参数
export interface AnalyzeForgeParams {
  userInput: string;
  userId: number;
  sessionId: string;
}

// MCP 分析请求参数
export interface AnalyzeMCPParams {
  userInput: string;
  userId: number;
  sessionId: string;
}

// Forge 分析结果
export interface ForgeAnalyzeResult {
  type: "use_existing_forge" | "no_match";
  forgeId?: number;
  forgeName?: string;
  originalQuery: string;
}

// MCP 分析结果
export interface MCPAnalyzeResult {
  type: "create_forge" | "not_supported";
  mcpIds?: number[];
  originalQuery: string;
}

// 统一意图分析结果
export type IntentAnalyzeResult = ForgeAnalyzeResult | MCPAnalyzeResult;

class IntentService {
  /**
   * 统一意图分析
   * 先尝试匹配现有 Forge，如果没有匹配则分析 MCP 工具
   */
  static async analyzeIntent(params: AnalyzeForgeParams): Promise<IntentAnalyzeResult> {
    const { userInput, userId, sessionId } = params;

    // 第一阶段：尝试匹配现有 Forge
    const forgeResult = await this.analyzeForgeIntent(params);

    // 如果匹配到 Forge，直接返回
    if (forgeResult.type === "use_existing_forge") {
      return forgeResult;
    }

    // 第二阶段：分析 MCP 工具
    const mcpResult = await this.analyzeMCPIntent({
      userInput,
      userId,
      sessionId,
    });

    return mcpResult;
  }

  /**
   * 分析 Forge 意图
   * 根据用户输入和现有 Forge 摘要，判断是否有匹配的 Forge
   */
  static async analyzeForgeIntent(params: AnalyzeForgeParams): Promise<ForgeAnalyzeResult> {
    const { userInput, userId, sessionId } = params;

    const gateway = await loadGateway();

    // 创建 AbortController 用于取消操作
    const controller = gateway.intentAbortManager.create(sessionId);

    try {
      // 获取所有 Forge 摘要
      const forgeSummaries = await ForgeService.getAllForgeSummaries(userId);

      // 过滤出有摘要的 Forge，并转换为 Gateway 需要的格式
      const validSummaries = forgeSummaries
        .filter((f) => f.summary && f.summary.trim())
        .map((f) => ({
          id: f.id,
          name: f.name,
          summary: f.summary,
        }));

      // 如果没有有效的 Forge 摘要，直接返回 no_match
      if (validSummaries.length === 0) {
        return {
          type: "no_match",
          originalQuery: userInput,
        };
      }

      // 调用 Gateway 进行意图分析
      const result = await gateway.analyzeForgeIntent(userInput, validSummaries, controller.signal);

      return result;
    } finally {
      // 清理 AbortController
      gateway.intentAbortManager.cleanup(sessionId);
    }
  }

  /**
   * 分析 MCP 意图
   * 根据用户输入和可用 MCP 工具，判断是否可以创建新 Forge
   */
  static async analyzeMCPIntent(params: AnalyzeMCPParams): Promise<MCPAnalyzeResult> {
    const { userInput, userId, sessionId } = params;

    const gateway = await loadGateway();

    // 创建 AbortController 用于取消操作
    const controller = gateway.intentAbortManager.create(sessionId);

    try {
      // 获取所有已连接的 MCP
      const mcpList = await McpDAO.findByStatus("connected");

      // 获取每个 MCP 的工具列表
      const mcpInfoList: MCPInfo[] = [];
      for (const mcp of mcpList) {
        try {
          const tools = await mcpManager.getTools(mcp.id);
          mcpInfoList.push({
            id: mcp.id,
            name: mcp.name,
            tools: tools.map((t: MCPTool) => ({
              name: t.name,
              description: t.description || "",
            })),
          });
        } catch (error) {
          // 获取工具失败，跳过该 MCP
          console.error(`获取 MCP ${mcp.id} 工具列表失败:`, (error as Error).message);
        }
      }

      // 如果没有可用的 MCP，直接返回 not_supported
      if (mcpInfoList.length === 0) {
        return {
          type: "not_supported",
          originalQuery: userInput,
        };
      }

      // 调用 Gateway 进行意图分析
      const result = await gateway.analyzeMCPIntent(userInput, mcpInfoList, controller.signal);

      return result;
    } finally {
      // 清理 AbortController
      gateway.intentAbortManager.cleanup(sessionId);
    }
  }

  /**
   * 取消意图分析操作
   * @param sessionId 会话 ID
   */
  static async cancelIntent(sessionId: string): Promise<{ success: boolean; message: string }> {
    const gateway = await loadGateway();
    const aborted = gateway.intentAbortManager.abort(sessionId);

    if (aborted) {
      return { success: true, message: "操作已取消" };
    } else {
      return { success: false, message: "未找到对应的操作或操作已完成" };
    }
  }
}

export default IntentService;
