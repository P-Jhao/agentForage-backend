/**
 * 对话轮次结束统计数据类型定义
 */

/**
 * Token 使用统计
 */
export interface TokenUsage {
  // 提示词 token 数
  promptTokens: number;
  // 补全 token 数
  completionTokens: number;
  // 总 token 数
  totalTokens: number;
}

/**
 * 轮次结束数据
 * 包含该轮对话的统计信息
 */
export interface TurnEndData {
  // 完成时间（ISO 8601 格式）
  completedAt: string;
  // 累积 token 消耗（任务开始到当前轮次的总计）
  accumulatedTokens: TokenUsage;
}
