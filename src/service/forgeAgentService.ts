/**
 * Forge Agent 服务
 * 负责获取 Forge 数据，调用 Gateway 的 forgeAgentStream
 */
import McpForgeDAO from "../dao/mcpForgeDAO.js";
import ForgeDAO from "../dao/forgeDAO.js";
import { mcpManager } from "../mcp/index.js";
import type { MCPToolCallResult } from "../mcp/types.js";

// 动态导入 gateway
const loadGateway = async () => {
  return await import("agentforge-gateway");
};

/**
 * 消息格式
 */
export interface AgentMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 流式输出块
 */
export interface AgentStreamChunk {
  type: "thinking" | "chat" | "tool" | "tool_result" | "error";
  data: unknown;
}

/**
 * 将 MCP 工具调用结果转换为字符串
 */
function formatToolResult(result: MCPToolCallResult): string {
  if (result.isError) {
    return `工具执行错误: ${result.content.map((c) => c.text || "").join("\n")}`;
  }

  return result.content
    .map((c) => {
      if (c.type === "text") return c.text || "";
      if (c.type === "image") return `[图片: ${c.mimeType}]`;
      if (c.type === "resource") return `[资源: ${c.mimeType}]`;
      return "";
    })
    .join("\n");
}

/**
 * 工具执行器
 * 通过 mcpManager 调用 MCP Server 执行工具
 */
async function toolExecutor(
  mcpId: number,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  console.log(`[ForgeAgentService] 执行工具: ${toolName}, mcpId: ${mcpId}`);

  const result = await mcpManager.callTool(mcpId, toolName, args);
  return formatToolResult(result);
}

class ForgeAgentService {
  /**
   * 使用 Forge Agent 进行流式对话
   * @param forgeId Forge ID（可选，为空时无工具和系统提示词）
   * @param messages 消息历史
   * @param model 模型选择（可选）
   */
  async *stream(
    forgeId: number | null | undefined,
    messages: AgentMessage[],
    model?: "qwen" | "deepseek"
  ): AsyncGenerator<AgentStreamChunk> {
    let systemPrompt: string | undefined;
    let tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      mcpId: number;
    }> = [];

    // 如果有 forgeId，获取 Forge 信息和工具
    console.log(`[ForgeAgentService] 收到 forgeId: ${forgeId}`);
    if (forgeId) {
      const forge = await ForgeDAO.findById(forgeId);
      console.log(`[ForgeAgentService] 查询到 Forge: ${forge ? forge.displayName : "null"}`);
      if (forge) {
        systemPrompt = forge.systemPrompt || undefined;

        // 获取 Forge 关联的工具
        const forgeTools = await McpForgeDAO.getForgeTools(forgeId);
        console.log(`[ForgeAgentService] Forge ${forgeId} 关联工具数: ${forgeTools.length}`);
        console.log(
          `[ForgeAgentService] 工具列表:`,
          forgeTools.map((t) => t.name)
        );

        // 调试：直接查询 mcp_forge 表
        const rawAssociations = await McpForgeDAO.findByForgeId(forgeId);
        console.log(`[ForgeAgentService] mcp_forge 原始关联数: ${rawAssociations.length}`);
        for (const assoc of rawAssociations) {
          console.log(
            `[ForgeAgentService] - mcpId: ${assoc.mcpId}, tools 数量: ${assoc.tools?.length || 0}`
          );
          console.log(`[ForgeAgentService]   tools:`, JSON.stringify(assoc.tools));
        }

        tools = forgeTools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          mcpId: t.mcpId,
        }));
      }
    } else {
      console.log("[ForgeAgentService] 无 Forge，使用默认 Agent（无工具）");
    }

    // 加载 Gateway 并调用 forgeAgentStream
    const { forgeAgentStream } = await loadGateway();

    // 调用 Gateway 的流式函数
    yield* forgeAgentStream({
      model,
      systemPrompt,
      messages,
      tools,
      toolExecutor: tools.length > 0 ? toolExecutor : undefined,
    });
  }

  /**
   * 使用 Forge Agent 进行同步对话
   * @param forgeId Forge ID（可选，为空时无工具和系统提示词）
   * @param messages 消息历史
   * @param model 模型选择（可选）
   */
  async invoke(
    forgeId: number | null | undefined,
    messages: AgentMessage[],
    model?: "qwen" | "deepseek"
  ): Promise<string> {
    let systemPrompt: string | undefined;
    let tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      mcpId: number;
    }> = [];

    // 如果有 forgeId，获取 Forge 信息和工具
    if (forgeId) {
      const forge = await ForgeDAO.findById(forgeId);
      if (forge) {
        systemPrompt = forge.systemPrompt || undefined;

        // 获取 Forge 关联的工具
        const forgeTools = await McpForgeDAO.getForgeTools(forgeId);
        tools = forgeTools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          mcpId: t.mcpId,
        }));
      }
    }

    // 加载 Gateway 并调用 forgeAgentInvoke
    const { forgeAgentInvoke } = await loadGateway();

    // 调用 Gateway 的同步函数
    return await forgeAgentInvoke({
      model,
      systemPrompt,
      messages,
      tools,
      toolExecutor: tools.length > 0 ? toolExecutor : undefined,
    });
  }
}

export default new ForgeAgentService();
