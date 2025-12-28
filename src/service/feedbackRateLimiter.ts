/**
 * 反馈节流控制服务
 * 限制用户在 60 秒内最多提交 5 次反馈
 *
 * 使用内存 Map 存储用户请求记录，定时清理过期记录
 */

// 节流配置
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 秒时间窗口
const RATE_LIMIT_MAX_REQUESTS = 5; // 最大请求次数
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟清理一次过期记录

// 用户请求记录：userId -> 请求时间戳数组
const userRequestMap = new Map<number, number[]>();

// 定时清理过期记录
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动定时清理任务
 */
function startCleanupTimer() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    for (const [userId, timestamps] of userRequestMap.entries()) {
      // 过滤掉过期的时间戳
      const validTimestamps = timestamps.filter((ts) => ts > windowStart);

      if (validTimestamps.length === 0) {
        // 没有有效记录，删除该用户
        userRequestMap.delete(userId);
      } else if (validTimestamps.length !== timestamps.length) {
        // 有过期记录，更新
        userRequestMap.set(userId, validTimestamps);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

/**
 * 停止定时清理任务（用于测试）
 */
function stopCleanupTimer() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * 清空所有记录（用于测试）
 */
function clearAll() {
  userRequestMap.clear();
}

/**
 * 检查用户是否超过节流限制
 * @param userId 用户 ID
 * @returns true 表示允许请求，false 表示超过限制
 */
function checkLimit(userId: number): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // 获取用户的请求记录
  const timestamps = userRequestMap.get(userId) || [];

  // 过滤出时间窗口内的请求
  const validTimestamps = timestamps.filter((ts) => ts > windowStart);

  // 检查是否超过限制
  return validTimestamps.length < RATE_LIMIT_MAX_REQUESTS;
}

/**
 * 记录用户请求
 * @param userId 用户 ID
 */
function recordRequest(userId: number) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // 获取用户的请求记录
  const timestamps = userRequestMap.get(userId) || [];

  // 过滤出时间窗口内的请求，并添加新请求
  const validTimestamps = timestamps.filter((ts) => ts > windowStart);
  validTimestamps.push(now);

  // 更新记录
  userRequestMap.set(userId, validTimestamps);

  // 确保清理任务已启动
  startCleanupTimer();
}

/**
 * 获取用户在时间窗口内的请求次数（用于测试）
 */
function getRequestCount(userId: number): number {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  const timestamps = userRequestMap.get(userId) || [];
  return timestamps.filter((ts) => ts > windowStart).length;
}

// 导出服务
const FeedbackRateLimiter = {
  checkLimit,
  recordRequest,
  getRequestCount,
  clearAll,
  startCleanupTimer,
  stopCleanupTimer,
  // 导出配置常量（用于测试）
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
};

export default FeedbackRateLimiter;
