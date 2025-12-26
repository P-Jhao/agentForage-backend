/**
 * 文件清理工具
 * 用于清理聊天上传的临时文件
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 聊天文件上传目录
const chatUploadDir = path.join(__dirname, "../../public/uploads/chat");

/**
 * 删除指定的文件列表
 * @param filePaths 文件绝对路径列表
 */
export async function deleteFiles(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    try {
      // 安全检查：确保文件在 chat 上传目录内
      const normalizedPath = path.normalize(filePath);
      if (!normalizedPath.startsWith(path.normalize(chatUploadDir))) {
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
 * 清理过期的聊天文件
 * @param maxAgeMs 文件最大存活时间（毫秒），默认 1 小时
 */
export async function cleanupExpiredFiles(maxAgeMs: number = 60 * 60 * 1000): Promise<number> {
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
            `[fileCleanup] 清理过期文件: ${file} (${Math.round(fileAge / 1000 / 60)} 分钟前)`
          );
        }
      } catch (error) {
        console.error(`[fileCleanup] 处理文件失败: ${file}`, error);
      }
    }

    if (deletedCount > 0) {
      console.log(`[fileCleanup] 本次清理了 ${deletedCount} 个过期文件`);
    }
  } catch (error) {
    console.error("[fileCleanup] 清理过期文件失败:", error);
  }

  return deletedCount;
}

/**
 * 启动定时清理任务
 * @param intervalMs 清理间隔（毫秒），默认 1 小时
 * @param maxAgeMs 文件最大存活时间（毫秒），默认 1 小时
 */
export function startCleanupScheduler(
  intervalMs: number = 60 * 60 * 1000,
  maxAgeMs: number = 60 * 60 * 1000
): NodeJS.Timeout {
  console.log(`[fileCleanup] 启动定时清理任务，间隔: ${intervalMs / 1000 / 60} 分钟`);

  // 启动时先执行一次清理
  cleanupExpiredFiles(maxAgeMs);

  // 定时执行
  return setInterval(() => {
    cleanupExpiredFiles(maxAgeMs);
  }, intervalMs);
}
