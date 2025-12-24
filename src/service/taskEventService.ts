/**
 * 任务事件服务
 * 管理 SSE 连接池，推送任务状态变化和 MCP 状态变化
 */
import type { ServerResponse } from "http";

// 任务事件类型
export interface TaskEvent {
  type: "status_change" | "task_update" | "title_update";
  taskUuid: string;
  data: {
    status?: string;
    updatedAt?: string;
    title?: string;
  };
}

// MCP 事件类型
export interface MCPEvent {
  type: "mcp:status_change";
  mcpId: number;
  data: {
    status: "connected" | "disconnected" | "closed";
    name?: string;
  };
}

// 智能意图路由 SSE 事件类型
export interface IntentSSEEvent {
  type:
    | "intent:analyze_start"
    | "intent:analyze_result"
    | "intent:config_start"
    | "intent:config_chunk"
    | "intent:config_done"
    | "intent:config_complete"
    | "intent:cancelled"
    | "intent:error";
  sessionId: string;
  data?: unknown;
}

// 用户连接信息
interface UserConnection {
  userId: number;
  res: ServerResponse;
}

// 意图事件订阅信息
interface IntentSubscription {
  userId: number;
  sessionId: string;
}

class TaskEventService {
  // 连接池：userId -> 连接列表（一个用户可能有多个标签页）
  private connections: Map<number, UserConnection[]> = new Map();

  // 意图事件订阅：sessionId -> 订阅信息
  private intentSubscriptions: Map<string, IntentSubscription> = new Map();

  /**
   * 添加用户连接
   */
  addConnection(userId: number, res: ServerResponse) {
    const userConnections = this.connections.get(userId) || [];
    userConnections.push({ userId, res });
    this.connections.set(userId, userConnections);

    console.log(
      `[TaskEventService] 用户 ${userId} 建立连接，当前连接数: ${userConnections.length}`
    );
  }

  /**
   * 移除用户连接
   */
  removeConnection(userId: number, res: ServerResponse) {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;

    const index = userConnections.findIndex((conn) => conn.res === res);
    if (index !== -1) {
      userConnections.splice(index, 1);
      console.log(
        `[TaskEventService] 用户 ${userId} 断开连接，剩余连接数: ${userConnections.length}`
      );
    }

    // 如果没有连接了，删除该用户的记录
    if (userConnections.length === 0) {
      this.connections.delete(userId);
    }
  }

  /**
   * 向指定用户推送事件
   */
  pushToUser(userId: number, event: TaskEvent) {
    const userConnections = this.connections.get(userId);
    if (!userConnections || userConnections.length === 0) {
      return;
    }

    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const conn of userConnections) {
      try {
        conn.res.write(data);
      } catch (error) {
        console.error(`[TaskEventService] 推送失败:`, error);
        // 移除失败的连接
        this.removeConnection(userId, conn.res);
      }
    }
  }

  /**
   * 推送任务状态变化
   */
  pushTaskStatusChange(userId: number, taskUuid: string, status: string, updatedAt: string) {
    this.pushToUser(userId, {
      type: "status_change",
      taskUuid,
      data: { status, updatedAt },
    });
  }

  /**
   * 推送任务更新（标题、收藏等）
   */
  pushTaskUpdate(userId: number, taskUuid: string, data: TaskEvent["data"]) {
    this.pushToUser(userId, {
      type: "task_update",
      taskUuid,
      data,
    });
  }

  /**
   * 获取当前连接统计
   */
  getStats() {
    let totalConnections = 0;
    for (const conns of this.connections.values()) {
      totalConnections += conns.length;
    }
    return {
      userCount: this.connections.size,
      totalConnections,
    };
  }

  /**
   * 广播事件给所有连接的用户
   * 用于 MCP 状态变化等全局事件
   */
  broadcast(event: MCPEvent) {
    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const [userId, userConnections] of this.connections) {
      for (const conn of userConnections) {
        try {
          conn.res.write(data);
        } catch (error) {
          console.error(`[TaskEventService] 广播失败 (用户 ${userId}):`, error);
          this.removeConnection(userId, conn.res);
        }
      }
    }
  }

  /**
   * 推送 MCP 状态变化（广播给所有用户）
   */
  pushMCPStatusChange(
    mcpId: number,
    status: "connected" | "disconnected" | "closed",
    name?: string
  ) {
    console.log(`[TaskEventService] 广播 MCP ${mcpId} 状态变化: ${status}`);
    this.broadcast({
      type: "mcp:status_change",
      mcpId,
      data: { status, name },
    });
  }

  /**
   * 推送标题更新（用于打字机效果）
   * 前端收到后会逐字显示新标题
   */
  pushTitleUpdate(userId: number, taskUuid: string, title: string) {
    console.log(`[TaskEventService] 推送标题更新: ${taskUuid} -> ${title}`);
    this.pushToUser(userId, {
      type: "title_update",
      taskUuid,
      data: { title },
    });
  }

  // ========== 智能意图路由事件 ==========

  /**
   * 订阅意图事件
   * @param userId 用户 ID
   * @param sessionId 会话 ID
   */
  subscribeIntent(userId: number, sessionId: string) {
    this.intentSubscriptions.set(sessionId, { userId, sessionId });
    console.log(`[TaskEventService] 用户 ${userId} 订阅意图事件: ${sessionId}`);
  }

  /**
   * 取消订阅意图事件
   * @param sessionId 会话 ID
   */
  unsubscribeIntent(sessionId: string) {
    const subscription = this.intentSubscriptions.get(sessionId);
    if (subscription) {
      this.intentSubscriptions.delete(sessionId);
      console.log(`[TaskEventService] 取消意图事件订阅: ${sessionId}`);
    }
  }

  /**
   * 检查是否已订阅意图事件
   * @param sessionId 会话 ID
   */
  isIntentSubscribed(sessionId: string): boolean {
    return this.intentSubscriptions.has(sessionId);
  }

  /**
   * 推送意图事件给指定会话
   * @param sessionId 会话 ID
   * @param event 意图事件
   */
  pushIntentEvent(sessionId: string, event: Omit<IntentSSEEvent, "sessionId">) {
    const subscription = this.intentSubscriptions.get(sessionId);
    if (!subscription) {
      console.log(`[TaskEventService] 意图事件订阅不存在: ${sessionId}`);
      return;
    }

    const userConnections = this.connections.get(subscription.userId);
    if (!userConnections || userConnections.length === 0) {
      console.log(`[TaskEventService] 用户 ${subscription.userId} 无活跃连接`);
      return;
    }

    const fullEvent: IntentSSEEvent = {
      ...event,
      sessionId,
    };

    const data = `data: ${JSON.stringify(fullEvent)}\n\n`;

    for (const conn of userConnections) {
      try {
        conn.res.write(data);
      } catch (error) {
        console.error(`[TaskEventService] 推送意图事件失败:`, error);
        this.removeConnection(subscription.userId, conn.res);
      }
    }
  }

  /**
   * 推送意图分析开始事件
   */
  pushIntentAnalyzeStart(sessionId: string) {
    this.pushIntentEvent(sessionId, {
      type: "intent:analyze_start",
    });
  }

  /**
   * 推送意图分析结果事件
   */
  pushIntentAnalyzeResult(sessionId: string, result: unknown) {
    this.pushIntentEvent(sessionId, {
      type: "intent:analyze_result",
      data: result,
    });
  }

  /**
   * 推送配置生成开始事件
   */
  pushIntentConfigStart(sessionId: string, field: "name" | "description" | "systemPrompt") {
    this.pushIntentEvent(sessionId, {
      type: "intent:config_start",
      data: { field },
    });
  }

  /**
   * 推送配置生成内容块事件
   */
  pushIntentConfigChunk(
    sessionId: string,
    field: "name" | "description" | "systemPrompt",
    content: string
  ) {
    this.pushIntentEvent(sessionId, {
      type: "intent:config_chunk",
      data: { field, content },
    });
  }

  /**
   * 推送配置生成完成事件
   */
  pushIntentConfigDone(
    sessionId: string,
    field: "name" | "description" | "systemPrompt",
    content: string
  ) {
    this.pushIntentEvent(sessionId, {
      type: "intent:config_done",
      data: { field, content },
    });
  }

  /**
   * 推送配置生成全部完成事件
   */
  pushIntentConfigComplete(sessionId: string) {
    this.pushIntentEvent(sessionId, {
      type: "intent:config_complete",
    });
    // 完成后自动取消订阅
    this.unsubscribeIntent(sessionId);
  }

  /**
   * 推送意图操作取消事件
   */
  pushIntentCancelled(sessionId: string) {
    this.pushIntentEvent(sessionId, {
      type: "intent:cancelled",
    });
    // 取消后自动取消订阅
    this.unsubscribeIntent(sessionId);
  }

  /**
   * 推送意图操作错误事件
   */
  pushIntentError(sessionId: string, message: string) {
    this.pushIntentEvent(sessionId, {
      type: "intent:error",
      data: { message },
    });
    // 错误后自动取消订阅
    this.unsubscribeIntent(sessionId);
  }
}

// 导出单例
export default new TaskEventService();
