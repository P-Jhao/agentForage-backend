/**
 * 文件清理工具
 * 用于清理聊天上传的临时文件和会话文件
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sessionFileManager } from "../service/sessionFileManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 聊天文件上传目录
const chatUploadDir = path.join(__dirname, "../../public/uploads/chat");

// MCP 输出文件目录
const mcpOutputDir = path.join(__dirname, "../../public/mcp-outputs");

/**
 * 删除指定的文件列表
 * @param filePaths 文件绝对路径列表
 */
export async function deleteFiles(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    try {
      // 安全检查：确保文件在允许的目录内
      const normalizedPath = path.normalize(filePath);
      const isInChatDir = normalizedPath.startsWith(path.normalize(chatUploadDir));
      const isInMcpDir = normalizedPath.startsWith(path.normalize(mcpOutputDir));

      if (!isInChatDir && !isInMcpDir) {
        console.warn(`[fileCleanup] 跳过非法路径: ${filePath}`);
        continue;
      }

      // 检查文件是否存在
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log(`[fileCleanup] 已删除文件: ${filePath}`);
      }
    } catch (error) {
      console.error(`[fileCleanup] 删除文件失败: ${filePath}`, error);
    }
  }
}

/**
 * 清理过期的会话文件
 * 通过 SessionFileManager 获取过期会话，删除对应的物理文件
 */
export async function cleanupExpiredSessionFiles(): Promise<number> {
  // 获取过期会话的文件路径
  const expiredFilePaths = sessionFileManager.cleanupExpiredSessions();

  if (expiredFilePaths.length === 0) {
    return 0;
  }

  // 删除物理文件
  await deleteFiles(expiredFilePaths);

  console.log(`[fileCleanup] 清理了 ${expiredFilePaths.length} 个过期会话文件`);
  return expiredFilePaths.length;
}

/**
 * 清理过期的聊天文件（基于文件修改时间）
 * 作为兜底机制，清理未被 SessionFileManager 管理的孤立文件
 * @param maxAgeMs 文件最大存活时间（毫秒），默认 2 小时
 */
export async function cleanupOrphanFiles(maxAgeMs: number = 2 * 60 * 60 * 1000): Promise<number> {
  let deletedCount = 0;

  try {
    // 确保目录存在
    if (!fs.existsSync(chatUploadDir)) {
      return 0;
    }

    const files = await fs.promises.readdir(chatUploadDir);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(chatUploadDir, file);

      try {
        const stats = await fs.promises.stat(filePath);

        // 跳过目录
        if (stats.isDirectory()) {
          continue;
        }

        // 检查文件是否过期
        const fileAge = now - stats.mtimeMs;
        if (fileAge > maxAgeMs) {
          await fs.promises.unlink(filePath);
          deletedCount++;
          console.log(
            `[fileCleanup] 清理孤立文件: ${file} (${Math.round(fileAge / 1000 / 60)} 分钟前)`
          );
        }
      } catch (error) {
        console.error(`[fileCleanup] 处理文件失败: ${file}`, error);
      }
    }

    if (deletedCount > 0) {
      console.log(`[fileCleanup] 本次清理了 ${deletedCount} 个孤立文件`);
    }
  } catch (error) {
    console.error("[fileCleanup] 清理孤立文件失败:", error);
  }

  return deletedCount;
}

/**
 * 清理过期的 MCP 输出文件
 * @param maxAgeMs 文件最大存活时间（毫秒），默认 24 小时
 */
export async function cleanupMcpOutputFiles(
  maxAgeMs: number = 24 * 60 * 60 * 1000
): Promise<number> {
  let deletedCount = 0;

  try {
    // 确保目录存在
    if (!fs.existsSync(mcpOutputDir)) {
      return 0;
    }

    const files = await fs.promises.readdir(mcpOutputDir);
    const now = Date.now();

    for (const file of files) {
      // 跳过 .gitkeep 文件
      if (file === ".gitkeep") {
        continue;
      }

      const filePath = path.join(mcpOutputDir, file);

      try {
        const stats = await fs.promises.stat(filePath);

        // 跳过目录
        if (stats.isDirectory()) {
          continue;
        }

        // 检查文件是否过期
        const fileAge = now - stats.mtimeMs;
        if (fileAge > maxAgeMs) {
          await fs.promises.unlink(filePath);
          deletedCount++;
          console.log(
            `[fileCleanup] 清理 MCP 输出文件: ${file} (${Math.round(fileAge / 1000 / 60 / 60)} 小时前)`
          );
        }
      } catch (error) {
        console.error(`[fileCleanup] 处理 MCP 输出文件失败: ${file}`, error);
      }
    }

    if (deletedCount > 0) {
      console.log(`[fileCleanup] 本次清理了 ${deletedCount} 个 MCP 输出文件`);
    }
  } catch (error) {
    console.error("[fileCleanup] 清理 MCP 输出文件失败:", error);
  }

  return deletedCount;
}

/**
 * 执行所有清理任务
 */
export async function runAllCleanupTasks(): Promise<void> {
  // 1. 清理过期会话文件
  await cleanupExpiredSessionFiles();

  // 2. 清理孤立的聊天文件（兜底）
  await cleanupOrphanFiles();

  // 3. 清理过期的 MCP 输出文件
  await cleanupMcpOutputFiles();
}

/**
 * 启动定时清理任务
 * @param intervalMs 清理间隔（毫秒），默认 30 分钟
 */
export function startCleanupScheduler(intervalMs: number = 30 * 60 * 1000): NodeJS.Timeout {
  console.log(`[fileCleanup] 启动定时清理任务，间隔: ${intervalMs / 1000 / 60} 分钟`);

  // 启动时先执行一次清理
  runAllCleanupTasks();

  // 定时执行
  return setInterval(() => {
    runAllCleanupTasks();
  }, intervalMs);
}

// 兼容旧接口
export const cleanupExpiredFiles = cleanupOrphanFiles;
