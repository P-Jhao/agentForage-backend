/**
 * 任务事件服务
 * 管理 SSE 连接池，推送任务状态变化和 MCP 状态变化
 */
import type { ServerResponse } from "http";

// 任务事件类型
export interface TaskEvent {
  type: "status_change" | "task_update";
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

// 用户连接信息
interface UserConnection {
  userId: number;
  res: ServerResponse;
}

class TaskEventService {
  // 连接池：userId -> 连接列表（一个用户可能有多个标签页）
  private connections: Map<number, UserConnection[]> = new Map();

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
}

// 导出单例
export default new TaskEventService();
