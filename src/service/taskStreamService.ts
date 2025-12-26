/**
 * 任务流服务
 * 管理正在运行的任务的流式输出，支持多订阅者
 */
import type { ServerResponse } from "http";

// SSE 消息类型
interface SSEChunk {
  type:
    | "history"
    | "thinking"
    | "chat"
    | "tool"
    | "tool_call_start"
    | "tool_call_result"
    | "summary"
    | "error"
    | "done"
    // 提示词增强相关类型
    | "user_original"
    | "reviewer"
    | "questioner"
    | "expert"
    | "enhancer";
  data?: unknown;
}

// 任务流信息
interface TaskStream {
  taskUuid: string;
  // 已输出的内容缓冲区（用于新订阅者追赶）
  buffer: SSEChunk[];
  // 当前订阅者列表
  subscribers: Set<ServerResponse>;
  // 是否已完成
  completed: boolean;
}

class TaskStreamService {
  // 任务流映射：taskUuid -> TaskStream
  private streams: Map<string, TaskStream> = new Map();

  /**
   * 检查响应是否已关闭
   */
  private isResponseClosed(res: ServerResponse): boolean {
    return res.writableEnded || res.destroyed || !res.writable;
  }

  /**
   * 清理已关闭的订阅者
   */
  private cleanupClosedSubscribers(stream: TaskStream): void {
    const closedSubscribers: ServerResponse[] = [];
    for (const subscriber of stream.subscribers) {
      if (this.isResponseClosed(subscriber)) {
        closedSubscribers.push(subscriber);
      }
    }
    for (const subscriber of closedSubscribers) {
      stream.subscribers.delete(subscriber);
    }
    if (closedSubscribers.length > 0) {
      console.log(
        `[TaskStreamService] 任务 ${stream.taskUuid} 清理了 ${closedSubscribers.length} 个已关闭的订阅者，剩余: ${stream.subscribers.size}`
      );
    }
  }

  /**
   * 开始一个任务流
   */
  startStream(taskUuid: string): void {
    if (this.streams.has(taskUuid)) {
      console.warn(`[TaskStreamService] 任务 ${taskUuid} 的流已存在，将被覆盖`);
    }

    this.streams.set(taskUuid, {
      taskUuid,
      buffer: [],
      subscribers: new Set(),
      completed: false,
    });

    console.log(`[TaskStreamService] 任务 ${taskUuid} 流已开始`);
  }

  /**
   * 向任务流写入数据
   * 同时写入缓冲区和所有订阅者
   */
  write(taskUuid: string, chunk: SSEChunk): void {
    const stream = this.streams.get(taskUuid);
    if (!stream) {
      console.warn(`[TaskStreamService] 任务 ${taskUuid} 的流不存在`);
      return;
    }

    // 写入前先清理已关闭的订阅者
    this.cleanupClosedSubscribers(stream);

    // 写入缓冲区
    stream.buffer.push(chunk);

    // 写入所有订阅者
    const data = JSON.stringify(chunk) + "\n";
    const subscriberCount = stream.subscribers.size;

    if (subscriberCount === 0) {
      console.log(`[TaskStreamService] 任务 ${taskUuid} 没有订阅者，仅写入缓冲区`);
    }

    const failedSubscribers: ServerResponse[] = [];
    for (const subscriber of stream.subscribers) {
      try {
        // 再次检查连接状态
        if (this.isResponseClosed(subscriber)) {
          failedSubscribers.push(subscriber);
          continue;
        }
        subscriber.write(data);
        // 尝试立即刷新数据（如果支持）
        if (typeof (subscriber as unknown as { flush?: () => void }).flush === "function") {
          (subscriber as unknown as { flush: () => void }).flush();
        }
      } catch (error) {
        console.error(`[TaskStreamService] 写入订阅者失败:`, error);
        failedSubscribers.push(subscriber);
      }
    }

    // 移除失败的订阅者
    for (const subscriber of failedSubscribers) {
      stream.subscribers.delete(subscriber);
    }
  }

  /**
   * 结束任务流
   */
  endStream(taskUuid: string): void {
    const stream = this.streams.get(taskUuid);
    if (!stream) {
      return;
    }

    stream.completed = true;

    // 关闭所有订阅者连接
    for (const subscriber of stream.subscribers) {
      try {
        if (!this.isResponseClosed(subscriber)) {
          subscriber.end();
        }
      } catch {
        // 忽略关闭错误
      }
    }
    stream.subscribers.clear();

    // 延迟清理流数据（保留一段时间供可能的重连）
    setTimeout(() => {
      this.streams.delete(taskUuid);
      console.log(`[TaskStreamService] 任务 ${taskUuid} 流已清理`);
    }, 60000); // 保留 1 分钟

    console.log(`[TaskStreamService] 任务 ${taskUuid} 流已结束`);
  }

  /**
   * 订阅任务流
   * 返回是否成功订阅（任务流存在且未完成）
   */
  subscribe(taskUuid: string, res: ServerResponse): boolean {
    const stream = this.streams.get(taskUuid);
    if (!stream || stream.completed) {
      return false;
    }

    // 检查响应是否已关闭
    if (this.isResponseClosed(res)) {
      console.warn(`[TaskStreamService] 尝试订阅已关闭的响应`);
      return false;
    }

    // 订阅前先清理已关闭的订阅者
    this.cleanupClosedSubscribers(stream);

    // 先发送缓冲区中的所有数据（追赶）
    for (const chunk of stream.buffer) {
      try {
        res.write(JSON.stringify(chunk) + "\n");
      } catch (error) {
        console.error(`[TaskStreamService] 发送缓冲数据失败:`, error);
        return false;
      }
    }

    // 添加到订阅者列表
    stream.subscribers.add(res);

    console.log(
      `[TaskStreamService] 任务 ${taskUuid} 新增订阅者，当前订阅者数: ${stream.subscribers.size}`
    );

    return true;
  }

  /**
   * 取消订阅
   */
  unsubscribe(taskUuid: string, res: ServerResponse): void {
    const stream = this.streams.get(taskUuid);
    if (!stream) {
      return;
    }

    stream.subscribers.delete(res);
    console.log(
      `[TaskStreamService] 任务 ${taskUuid} 移除订阅者，剩余订阅者数: ${stream.subscribers.size}`
    );
  }

  /**
   * 检查任务流是否存在且正在运行
   */
  isRunning(taskUuid: string): boolean {
    const stream = this.streams.get(taskUuid);
    return !!stream && !stream.completed;
  }

  /**
   * 获取任务流的缓冲区内容
   */
  getBuffer(taskUuid: string): SSEChunk[] | null {
    const stream = this.streams.get(taskUuid);
    return stream ? [...stream.buffer] : null;
  }

  /**
   * 清空任务流的缓冲区
   * 在消息保存到数据库后调用，避免缓冲区无限增长
   */
  clearBuffer(taskUuid: string): void {
    const stream = this.streams.get(taskUuid);
    if (stream) {
      const bufferSize = stream.buffer.length;
      stream.buffer = [];
      console.log(`[TaskStreamService] 任务 ${taskUuid} 缓冲区已清空，清理了 ${bufferSize} 条数据`);
    }
  }
}

// 导出单例
export default new TaskStreamService();
