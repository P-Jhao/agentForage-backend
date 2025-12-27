/**
 * Token 累积服务
 * 管理任务级别的 token 消耗累积统计
 */
import type { TokenUsage } from "../types/turnEnd.js";

/**
 * 任务 token 累积器
 * 存储单个任务从开始到当前的累积 token 消耗
 */
interface TaskTokenAccumulator {
  taskUuid: string;
  // 累积的 token 统计
  accumulated: TokenUsage;
  // 创建时间（用于清理过期数据）
  createdAt: Date;
}

class TokenAccumulatorService {
  // 任务累积器映射：taskUuid -> TaskTokenAccumulator
  private accumulators: Map<string, TaskTokenAccumulator> = new Map();

  // 过期时间（毫秒）：24 小时
  private readonly EXPIRY_TIME = 24 * 60 * 60 * 1000;

  /**
   * 初始化任务的 token 累积器
   * @param taskUuid 任务 UUID
   * @param initialTokens 初始 token 值（可选，用于恢复历史状态）
   */
  init(taskUuid: string, initialTokens?: TokenUsage): void {
    this.accumulators.set(taskUuid, {
      taskUuid,
      accumulated: initialTokens || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      createdAt: new Date(),
    });

    console.log(
      `[TokenAccumulatorService] 任务 ${taskUuid} 累积器已初始化`,
      initialTokens ? `，初始值: ${initialTokens.totalTokens}` : ""
    );

    // 清理过期的累积器
    this.cleanupExpired();
  }

  /**
   * 累加 token 消耗
   * @param taskUuid 任务 UUID
   * @param usage 本次 token 消耗
   */
  add(taskUuid: string, usage: TokenUsage): void {
    const accumulator = this.accumulators.get(taskUuid);
    if (!accumulator) {
      console.warn(`[TokenAccumulatorService] 任务 ${taskUuid} 累积器不存在，自动初始化`);
      this.init(taskUuid);
      this.add(taskUuid, usage);
      return;
    }

    accumulator.accumulated.promptTokens += usage.promptTokens;
    accumulator.accumulated.completionTokens += usage.completionTokens;
    accumulator.accumulated.totalTokens += usage.totalTokens;

    console.log(
      `[TokenAccumulatorService] 任务 ${taskUuid} 累加 token: +${usage.totalTokens}，累计: ${accumulator.accumulated.totalTokens}`
    );
  }

  /**
   * 获取当前累积的 token 统计
   * @param taskUuid 任务 UUID
   * @returns 累积的 token 统计，如果不存在返回零值
   */
  get(taskUuid: string): TokenUsage {
    const accumulator = this.accumulators.get(taskUuid);
    if (!accumulator) {
      return {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
    }
    // 返回副本，避免外部修改
    return { ...accumulator.accumulated };
  }

  /**
   * 检查累积器是否存在
   * @param taskUuid 任务 UUID
   */
  has(taskUuid: string): boolean {
    return this.accumulators.has(taskUuid);
  }

  /**
   * 清理任务的累积器
   * @param taskUuid 任务 UUID
   */
  cleanup(taskUuid: string): void {
    if (this.accumulators.delete(taskUuid)) {
      console.log(`[TokenAccumulatorService] 任务 ${taskUuid} 累积器已清理`);
    }
  }

  /**
   * 清理过期的累积器
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const expiredTasks: string[] = [];

    for (const [taskUuid, accumulator] of this.accumulators) {
      if (now - accumulator.createdAt.getTime() > this.EXPIRY_TIME) {
        expiredTasks.push(taskUuid);
      }
    }

    for (const taskUuid of expiredTasks) {
      this.accumulators.delete(taskUuid);
    }

    if (expiredTasks.length > 0) {
      console.log(`[TokenAccumulatorService] 清理了 ${expiredTasks.length} 个过期累积器`);
    }
  }
}

// 导出单例
export default new TokenAccumulatorService();
