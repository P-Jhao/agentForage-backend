/**
 * 消息过滤工具
 * 用于过滤发送给 LLM 的历史消息，排除增强过程中的中间消息
 */
import type { FlatMessage } from "../dao/messageDAO.js";
import type { MessageType } from "../dao/models/Message.js";

/**
 * 需要过滤的增强过程消息类型
 * 这些类型的消息不应该发送给对话 LLM
 */
export const ENHANCE_PROCESS_TYPES: MessageType[] = [
  "user_original", // 用户原始输入（增强前）
  "reviewer", // 审查者输出
  "questioner", // 提问者输出
  "expert", // 专家分析输出
  "user_answer", // 用户对澄清问题的回复
];

/**
 * 过滤消息列表，用于构建发送给 LLM 的历史消息
 * 过滤掉增强过程的中间消息，只保留最终的增强提示词和对话内容
 *
 * @param messages 原始消息列表
 * @returns 过滤后的消息列表
 */
export function filterMessagesForLLM(messages: FlatMessage[]): FlatMessage[] {
  return messages.filter((msg) => !ENHANCE_PROCESS_TYPES.includes(msg.type));
}

/**
 * 判断消息类型是否为增强过程消息
 *
 * @param type 消息类型
 * @returns 是否为增强过程消息
 */
export function isEnhanceProcessType(type: MessageType): boolean {
  return ENHANCE_PROCESS_TYPES.includes(type);
}
