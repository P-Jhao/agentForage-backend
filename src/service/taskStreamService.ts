/**
 * 任务流服务
 * 管理正在运行的任务的流式输出，支持多订阅者
 */
import type { ServerResponse } from "http";

// SSE 消息类型
interface SSEChunk {
  type: "history" | "thinking" | "chat" | "tool" | "error" | "done";
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

    // 写入缓冲区
    stream.buffer.push(chunk);

    // 写入所有订阅者
    const data = JSON.stringify(chunk) + "\n";
    const subscriberCount = stream.subscribers.size;

    if (subscriberCount === 0) {
      console.log(`[TaskStreamService] 任务 ${taskUuid} 没有订阅者，仅写入缓冲区`);
    }

    for (const subscriber of stream.subscribers) {
      try {
        subscriber.write(data);
      } catch (error) {
        console.error(`[TaskStreamService] 写入订阅者失败:`, error);
        stream.subscribers.delete(subscriber);
      }
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
        subscriber.end();
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
}

// 导出单例
export default new TaskStreamService();
