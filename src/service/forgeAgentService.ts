/**
 * Forge Agent 服务
 * 负责获取 Forge 数据，调用 Gateway 的 forgeAgentStream
 */
import McpForgeDAO from "../dao/mcpForgeDAO.js";
import ForgeDAO from "../dao/forgeDAO.js";
import McpDAO from "../dao/mcpDAO.js";
import { mcpManager } from "../mcp/index.js";
import type { MCPToolCallResult } from "../mcp/types.js";
import type { CustomModelConfig } from "agentforge-gateway";
import { processToolArgs, type ToolPathConfig } from "../utils/toolPathHandler.js";

// 动态导入 gateway
const loadGateway = async () => {
  return await import("agentforge-gateway");
};

// MCP 路径配置缓存（mcpId -> toolPathConfig）
const mcpPathConfigCache = new Map<number, ToolPathConfig | null>();

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
  type:
    | "thinking"
    | "chat"
    | "tool_call_start"
    | "tool_call_result"
    | "summary"
    | "error"
    | "usage";
  data: unknown;
}

/**
 * 文件信息（包含路径和原始文件名）
 */
export interface FileInfo {
  path: string;
  originalName: string;
}

/**
 * 内置工具激活上下文
 */
export interface BuiltinContext {
  // 用户上传的文件信息列表（包含路径和原始文件名）
  files?: FileInfo[];
  // 其他上下文信息（可扩展）
  [key: string]: unknown;
}

// 重新导出 CustomModelConfig 供外部使用
export type { CustomModelConfig };

/**
 * 将 MCP 工具调用结果转换为字符串
 */
function formatToolResult(result: MCPToolCallResult, outputFiles?: string[]): string {
  if (result.isError) {
    return `工具执行错误: ${result.content.map((c) => c.text || "").join("\n")}`;
  }

  let resultText = result.content
    .map((c) => {
      if (c.type === "text") return c.text || "";
      if (c.type === "image") return `[图片: ${c.mimeType}]`;
      if (c.type === "resource") return `[资源: ${c.mimeType}]`;
      return "";
    })
    .join("\n");

  // 如果有输出文件，附加文件路径信息
  if (outputFiles && outputFiles.length > 0) {
    resultText += `\n\n[输出文件已保存到服务器: ${outputFiles.join(", ")}]`;
  }

  return resultText;
}

/**
 * 获取 MCP 的路径配置（带缓存）
 */
async function getMcpPathConfig(mcpId: number): Promise<ToolPathConfig | null> {
  // 检查缓存
  if (mcpPathConfigCache.has(mcpId)) {
    return mcpPathConfigCache.get(mcpId) || null;
  }

  // 从数据库获取
  const mcp = await McpDAO.findById(mcpId);
  let config: ToolPathConfig | null = null;

  if (mcp?.toolPathConfig) {
    try {
      config = JSON.parse(mcp.toolPathConfig) as ToolPathConfig;
    } catch (e) {
      console.error(`[ForgeAgentService] 解析 MCP ${mcpId} 的 toolPathConfig 失败:`, e);
    }
  }

  // 存入缓存
  mcpPathConfigCache.set(mcpId, config);
  return config;
}

/**
 * 清除 MCP 路径配置缓存
 */
export function clearMcpPathConfigCache(mcpId?: number): void {
  if (mcpId !== undefined) {
    mcpPathConfigCache.delete(mcpId);
  } else {
    mcpPathConfigCache.clear();
  }
}

/**
 * 创建工具执行器
 * 通过 mcpManager 调用 MCP Server 执行工具
 * 自动处理输入/输出路径参数
 * 如果有输出文件，自动读取文件内容
 * @param taskId 任务/会话 ID（用于查找会话文件映射）
 */
function createToolExecutor(taskId?: string) {
  return async function toolExecutor(
    mcpId: number,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    console.log(
      `[ForgeAgentService] 执行工具: ${toolName}, mcpId: ${mcpId}, 参数: ${JSON.stringify(args)}`
    );

    // 获取 MCP 的路径配置
    const pathConfig = await getMcpPathConfig(mcpId);

    // 处理路径参数（传入 taskId 用于 input 类型参数的映射）
    const { processedArgs, outputFiles } = await processToolArgs(
      mcpId,
      toolName,
      args,
      pathConfig,
      taskId
    );

    // 如果参数被修改，打印日志
    if (outputFiles.length > 0 || JSON.stringify(args) !== JSON.stringify(processedArgs)) {
      console.log(`[ForgeAgentService] 处理后的参数: ${JSON.stringify(processedArgs)}`);
    }

    const result = await mcpManager.callTool(mcpId, toolName, processedArgs);
    let formattedResult = formatToolResult(result, outputFiles);
    console.log(`[ForgeAgentService] 工具返回原始结果:`, JSON.stringify(result));

    // 如果有输出文件，自动读取文件内容
    if (outputFiles.length > 0 && !result.isError) {
      console.log(`[ForgeAgentService] 检测到输出文件，自动读取内容...`);
      const fileContents = await readOutputFiles(outputFiles);
      if (fileContents) {
        formattedResult += `\n\n--- 输出文件内容 ---\n${fileContents}`;
      }
    }

    return formattedResult;
  };
}

/**
 * 读取输出文件内容
 * 根据文件扩展名选择合适的内置 MCP 工具读取文件
 * @param filePaths 文件路径列表
 * @returns 文件内容（合并后的字符串）
 */
async function readOutputFiles(filePaths: string[]): Promise<string | null> {
  try {
    const { builtinMcpRegistry, FILE_TOOL_MAP } = await loadGateway();
    const path = await import("path");
    const contents: string[] = [];

    for (const filePath of filePaths) {
      try {
        // 根据文件扩展名获取对应的工具
        const ext = path.extname(filePath).toLowerCase();
        const toolInfo = FILE_TOOL_MAP[ext];

        if (!toolInfo) {
          console.warn(`[ForgeAgentService] 不支持的文件类型: ${ext}，跳过读取: ${filePath}`);
          continue;
        }

        console.log(
          `[ForgeAgentService] 读取输出文件: ${filePath}，使用工具: ${toolInfo.mcpName}/${toolInfo.toolName}`
        );

        const content = await builtinMcpRegistry.callTool(toolInfo.mcpName, toolInfo.toolName, {
          filePath,
        });

        if (content) {
          contents.push(content);
        }
      } catch (err) {
        console.error(`[ForgeAgentService] 读取文件失败: ${filePath}`, err);
      }
    }

    return contents.length > 0 ? contents.join("\n\n") : null;
  } catch (err) {
    console.error(`[ForgeAgentService] 加载 Gateway 失败:`, err);
    return null;
  }
}

class ForgeAgentService {
  /**
   * 使用 Forge Agent 进行流式对话
   * @param forgeId Forge ID（可选，为空时无工具和系统提示词）
   * @param messages 消息历史
   * @param model 模型选择（可选）
   * @param enableThinking 是否启用深度思考（默认 true）
   * @param builtinContext 内置工具激活上下文（可选，如用户上传的文件列表）
   * @param taskId 任务 ID（用于中断控制）
   * @param customModelConfig 自定义模型配置（可选，用户在设置中配置）
   */
  async *stream(
    forgeId: number | null | undefined,
    messages: AgentMessage[],
    model?: "qwen" | "deepseek",
    enableThinking: boolean = true,
    builtinContext?: BuiltinContext,
    taskId?: string,
    customModelConfig?: CustomModelConfig
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

    // 创建工具执行器（传入 taskId 用于 input 类型参数的映射）
    const toolExecutor = createToolExecutor(taskId);

    // 调用 Gateway 的流式函数
    yield* forgeAgentStream({
      model,
      systemPrompt,
      messages,
      tools,
      toolExecutor: tools.length > 0 ? toolExecutor : undefined,
      enableThinking,
      builtinContext,
      taskId,
      customModelConfig, // 自定义模型配置
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

    // 创建工具执行器（invoke 方法没有 taskId，不支持 input 类型参数映射）
    const toolExecutor = createToolExecutor();

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
