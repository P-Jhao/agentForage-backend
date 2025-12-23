/**
 * 流式消息类型定义
 */

// 消息类型枚举
export type ChunkType =
  | "chatStream" // AI 回复流式输出
  | "thinking" // AI 思考过程
  | "toolCall" // 工具调用开始
  | "toolResult" // 工具调用结果
  | "status" // 状态变更
  | "heartbeat" // 心跳
  | "error" // 错误
  | "done" // 结束
  // 提示词增强相关类型
  | "reviewer" // 审查者输出
  | "questioner" // 提问者输出
  | "expert" // 专家分析输出
  | "enhancer"; // 增强后的提示词

// 流式事件类型
export type StreamEvent = "start" | "data" | "end";

// 任务状态
export type TaskStatus = "running" | "success" | "failed";

// 流式文本数据（chatStream / thinking）
export interface StreamTextData {
  event: StreamEvent;
  content?: string;
}

// 工具调用数据
export interface ToolCallData {
  toolId: string;
  toolName: string;
  args: Record<string, unknown>;
}

// 工具结果数据
export interface ToolResultData {
  toolId: string;
  result: unknown;
  success: boolean;
  error?: string;
}

// 状态变更数据
export interface StatusData {
  status: TaskStatus;
  message?: string;
}

// 错误数据
export interface ErrorData {
  message: string;
  code?: string;
}

// 统一的流式消息结构
export interface StreamChunk {
  type: ChunkType;
  data?: StreamTextData | ToolCallData | ToolResultData | StatusData | ErrorData;
}

// 所有可能的 data 类型
export type ChunkData = StreamTextData | ToolCallData | ToolResultData | StatusData | ErrorData;

// 辅助函数：创建流式消息
export function createChunk(type: "chatStream" | "thinking", data: StreamTextData): StreamChunk;
export function createChunk(type: "toolCall", data: ToolCallData): StreamChunk;
export function createChunk(type: "toolResult", data: ToolResultData): StreamChunk;
export function createChunk(type: "status", data: StatusData): StreamChunk;
export function createChunk(type: "error", data: ErrorData): StreamChunk;
export function createChunk(type: "heartbeat" | "done"): StreamChunk;
// 提示词增强相关类型
export function createChunk(
  type: "reviewer" | "questioner" | "expert" | "enhancer",
  data: StreamTextData
): StreamChunk;
export function createChunk(type: ChunkType, data?: ChunkData): StreamChunk {
  return data !== undefined ? { type, data } : { type };
}
