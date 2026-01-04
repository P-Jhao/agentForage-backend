/**
 * 会话文件管理器
 * 管理会话级别的文件映射，支持跨对话访问用户上传的文件
 */

// 文件信息
interface FileInfo {
  originalName: string; // 原始文件名（LLM 看到的）
  realPath: string; // 真实路径（服务器上的）
}

// 会话文件数据
interface SessionFileData {
  // 文件映射：originalName → realPath
  files: Map<string, string>;
  // 最后访问时间
  lastAccessTime: number;
  // 创建时间
  createdAt: number;
}

// 默认过期时间：1 小时（毫秒）
const DEFAULT_EXPIRE_TIME = 60 * 60 * 1000;

/**
 * 会话文件管理器
 * 单例模式，管理所有会话的文件映射
 */
class SessionFileManager {
  // 会话文件存储：taskId → SessionFileData
  private sessions: Map<string, SessionFileData> = new Map();

  // 过期时间（毫秒）
  private expireTime: number = DEFAULT_EXPIRE_TIME;

  /**
   * 注册文件到会话
   * @param taskId 任务/会话 ID
   * @param files 文件列表
   */
  registerFiles(taskId: string, files: FileInfo[]): void {
    let session = this.sessions.get(taskId);

    if (!session) {
      // 创建新会话
      session = {
        files: new Map(),
        lastAccessTime: Date.now(),
        createdAt: Date.now(),
      };
      this.sessions.set(taskId, session);
    }

    // 添加文件到映射
    for (const file of files) {
      session.files.set(file.originalName, file.realPath);
    }

    // 更新访问时间
    session.lastAccessTime = Date.now();

    console.log(`[SessionFileManager] 注册文件到会话 ${taskId}:`, {
      fileCount: files.length,
      totalFiles: session.files.size,
      fileNames: files.map((f) => f.originalName),
    });
  }

  /**
   * 获取会话的文件映射
   * @param taskId 任务/会话 ID
   * @returns 文件映射 Map，如果会话不存在返回空 Map
   */
  getFileMap(taskId: string): Map<string, string> {
    const session = this.sessions.get(taskId);

    if (!session) {
      return new Map();
    }

    // 更新访问时间
    session.lastAccessTime = Date.now();

    return session.files;
  }

  /**
   * 根据原始文件名查找真实路径
   * @param taskId 任务/会话 ID
   * @param originalName 原始文件名
   * @returns 真实路径，如果未找到返回 null
   */
  resolveFilePath(taskId: string, originalName: string): string | null {
    const fileMap = this.getFileMap(taskId);

    // 1. 精确匹配
    if (fileMap.has(originalName)) {
      return fileMap.get(originalName)!;
    }

    // 2. 提取文件名部分匹配（处理 LLM 可能添加路径前缀的情况）
    const fileName = originalName.replace(/\\/g, "/").split("/").pop() || originalName;

    for (const [name, path] of fileMap) {
      if (name === fileName) {
        return path;
      }
    }

    // 3. 模糊匹配（文件名包含关系）
    for (const [name, path] of fileMap) {
      if (name.includes(fileName) || fileName.includes(name)) {
        console.log(`[SessionFileManager] 文件名模糊匹配: ${originalName} → ${name}`);
        return path;
      }
    }

    return null;
  }

  /**
   * 刷新会话访问时间
   * @param taskId 任务/会话 ID
   */
  refreshAccessTime(taskId: string): void {
    const session = this.sessions.get(taskId);
    if (session) {
      session.lastAccessTime = Date.now();
    }
  }

  /**
   * 获取会话的所有文件路径（用于清理）
   * @param taskId 任务/会话 ID
   * @returns 文件路径数组
   */
  getFilePaths(taskId: string): string[] {
    const session = this.sessions.get(taskId);
    if (!session) {
      return [];
    }
    return Array.from(session.files.values());
  }

  /**
   * 清理会话
   * @param taskId 任务/会话 ID
   * @returns 被清理的文件路径数组
   */
  clearSession(taskId: string): string[] {
    const session = this.sessions.get(taskId);
    if (!session) {
      return [];
    }

    const filePaths = Array.from(session.files.values());
    this.sessions.delete(taskId);

    console.log(`[SessionFileManager] 清理会话 ${taskId}:`, {
      fileCount: filePaths.length,
    });

    return filePaths;
  }

  /**
   * 获取所有过期的会话
   * @returns 过期会话的 taskId 数组
   */
  getExpiredSessions(): string[] {
    const now = Date.now();
    const expired: string[] = [];

    for (const [taskId, session] of this.sessions) {
      if (now - session.lastAccessTime > this.expireTime) {
        expired.push(taskId);
      }
    }

    return expired;
  }

  /**
   * 清理所有过期会话
   * @returns 被清理的文件路径数组
   */
  cleanupExpiredSessions(): string[] {
    const expiredTaskIds = this.getExpiredSessions();
    const allFilePaths: string[] = [];

    for (const taskId of expiredTaskIds) {
      const filePaths = this.clearSession(taskId);
      allFilePaths.push(...filePaths);
    }

    if (expiredTaskIds.length > 0) {
      console.log(`[SessionFileManager] 清理过期会话:`, {
        sessionCount: expiredTaskIds.length,
        fileCount: allFilePaths.length,
      });
    }

    return allFilePaths;
  }

  /**
   * 获取统计信息
   */
  getStats(): { sessionCount: number; totalFiles: number } {
    let totalFiles = 0;
    for (const session of this.sessions.values()) {
      totalFiles += session.files.size;
    }
    return {
      sessionCount: this.sessions.size,
      totalFiles,
    };
  }

  /**
   * 设置过期时间
   * @param ms 过期时间（毫秒）
   */
  setExpireTime(ms: number): void {
    this.expireTime = ms;
  }
}

// 导出单例
export const sessionFileManager = new SessionFileManager();
