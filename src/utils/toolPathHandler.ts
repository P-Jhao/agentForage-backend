/**
 * 工具路径处理器
 * 处理 MCP 工具的输入/输出路径参数
 */
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { sessionFileManager } from "../service/sessionFileManager.js";

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MCP 输出文件存储目录（相对于项目根目录）
const MCP_OUTPUT_DIR = path.resolve(__dirname, "../../public/mcp-outputs");

// 工具路径配置类型
export type PathType = "output" | "input" | null;
export type ToolPathConfig = Record<string, Record<string, PathType>>;

/**
 * 确保 MCP 输出目录存在
 */
async function ensureOutputDir(): Promise<void> {
  try {
    await fs.access(MCP_OUTPUT_DIR);
  } catch {
    await fs.mkdir(MCP_OUTPUT_DIR, { recursive: true });
    console.log(`[ToolPathHandler] 创建 MCP 输出目录: ${MCP_OUTPUT_DIR}`);
  }
}

/**
 * 生成唯一的输出文件路径
 * 格式: {mcpId}_{toolName}_{timestamp}_{randomId}.{ext}
 * @param mcpId MCP ID
 * @param toolName 工具名称
 * @param originalPath LLM 传入的原始路径（用于提取扩展名）
 */
export function generateOutputPath(mcpId: number, toolName: string, originalPath?: string): string {
  // 从原始路径提取扩展名，默认 .txt
  let ext = ".txt";
  if (originalPath) {
    const parsedExt = path.extname(originalPath);
    if (parsedExt) {
      ext = parsedExt;
    }
  }

  // 生成唯一文件名
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const fileName = `${mcpId}_${toolName}_${timestamp}_${randomId}${ext}`;

  return path.join(MCP_OUTPUT_DIR, fileName);
}

/**
 * 处理工具参数中的路径
 * 根据 toolPathConfig 配置，自动替换输入/输出路径参数
 * @param mcpId MCP ID
 * @param toolName 工具名称
 * @param args 原始参数
 * @param toolPathConfig 工具路径配置
 * @param taskId 任务/会话 ID（用于查找会话文件映射）
 * @returns 处理后的参数和生成的输出文件路径列表
 */
export async function processToolArgs(
  mcpId: number,
  toolName: string,
  args: Record<string, unknown>,
  toolPathConfig: ToolPathConfig | null,
  taskId?: string
): Promise<{
  processedArgs: Record<string, unknown>;
  outputFiles: string[];
}> {
  // 确保输出目录存在
  await ensureOutputDir();

  const processedArgs = { ...args };
  const outputFiles: string[] = [];

  // 如果没有配置，直接返回原始参数
  if (!toolPathConfig || !toolPathConfig[toolName]) {
    return { processedArgs, outputFiles };
  }

  const toolConfig = toolPathConfig[toolName];

  // 遍历配置，处理标记为 output 或 input 的参数
  for (const [paramName, pathType] of Object.entries(toolConfig)) {
    if (pathType === "output") {
      // 输出路径：生成服务器路径
      const originalValue = args[paramName] as string | undefined;
      const outputPath = generateOutputPath(mcpId, toolName, originalValue);
      processedArgs[paramName] = outputPath;
      outputFiles.push(outputPath);
      console.log(
        `[ToolPathHandler] 替换输出路径参数 ${paramName}: ${originalValue} -> ${outputPath}`
      );
    } else if (pathType === "input" && taskId) {
      // 输入路径：从会话文件映射中查找真实路径
      const llmPath = args[paramName] as string | undefined;
      if (llmPath) {
        const realPath = sessionFileManager.resolveFilePath(taskId, llmPath);
        if (realPath) {
          processedArgs[paramName] = realPath;
          console.log(`[ToolPathHandler] 替换输入路径参数 ${paramName}: ${llmPath} -> ${realPath}`);
        } else {
          console.warn(`[ToolPathHandler] 无法解析输入路径参数 ${paramName}: ${llmPath}，保持原值`);
        }
      }
    }
  }

  return { processedArgs, outputFiles };
}

/**
 * 获取 MCP 输出目录路径
 */
export function getMcpOutputDir(): string {
  return MCP_OUTPUT_DIR;
}
