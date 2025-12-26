/**
 * 任务中断服务
 * 统一管理任务的中断状态
 * 同时处理 Backend 层（PromptEnhanceService）和 Gateway 层（dualLLMAgentStream）的中断
 */
import { taskAbortManager } from "agentforge-gateway";

class TaskAbortService {
  // 已中断的任务集合（用于 Backend 层面的中断检查）
  private abortedTasks: Set<string> = new Set();

  /**
   * 中断任务
   * 同时标记 Backend 层和 Gateway 层的中断状态
   */
  abort(taskUuid: string): boolean {
    console.log(`[TaskAbortService] ========== 开始中断任务 ==========`);
    console.log(`[TaskAbortService] 任务 UUID: ${taskUuid}`);

    // 1. 标记 Backend 层的中断状态（用于 PromptEnhanceService 等）
    this.abortedTasks.add(taskUuid);
    console.log(`[TaskAbortService] 已标记 Backend 层中断状态`);

    // 2. 中断 Gateway 层的 LLM 调用（用于 ForgeAgentService）
    // taskAbortManager.abort() 会触发 AbortController.abort()
    // 这会使传给 LLM 的 signal 触发 AbortError，自动中断请求
    console.log(`[TaskAbortService] 调用 Gateway taskAbortManager.abort()...`);
    const gatewayAborted = taskAbortManager.abort(taskUuid);
    console.log(`[TaskAbortService] Gateway 中断结果: ${gatewayAborted}`);
    console.log(
      `[TaskAbortService] (true=找到并中断了 AbortController, false=未找到 AbortController)`
    );
    console.log(`[TaskAbortService] ========== 中断任务完成 ==========`);

    return true;
  }

  /**
   * 检查任务是否已被中断
   */
  isAborted(taskUuid: string): boolean {
    return this.abortedTasks.has(taskUuid);
  }

  /**
   * 清理任务的中断状态（任务完成后调用）
   */
  cleanup(taskUuid: string): void {
    this.abortedTasks.delete(taskUuid);
    console.log(`[TaskAbortService] 已清理中断状态: ${taskUuid}`);
  }
}

export default new TaskAbortService();
