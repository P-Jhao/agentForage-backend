/**
 * 消息过滤工具属性测试
 * 使用 fast-check 进行属性测试
 *
 * 运行测试: pnpm test
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  filterMessagesForLLM,
  isEnhanceProcessType,
  ENHANCE_PROCESS_TYPES,
} from "../utils/messageFilter.js";
import type { FlatMessage } from "../dao/messageDAO.js";
import type { MessageType } from "../dao/models/Message.js";

// 所有消息类型
const ALL_MESSAGE_TYPES: MessageType[] = [
  "chat",
  "thinking",
  "tool_call",
  "summary",
  "error",
  "user_original",
  "user_answer",
  "reviewer",
  "questioner",
  "expert",
  "enhancer",
];

// 应该保留的消息类型（发送给 LLM）
const PRESERVED_TYPES: MessageType[] = [
  "chat",
  "thinking",
  "tool_call",
  "summary",
  "error",
  "enhancer",
];

// 生成随机消息的 Arbitrary
const messageArbitrary = fc.record({
  id: fc.integer({ min: 1 }),
  role: fc.constantFrom("user", "assistant", "system") as fc.Arbitrary<
    "user" | "assistant" | "system"
  >,
  type: fc.constantFrom(...ALL_MESSAGE_TYPES),
  content: fc.string(),
  createdAt: fc.date(),
});

// 生成消息列表的 Arbitrary
const messagesArbitrary = fc.array(messageArbitrary, { minLength: 0, maxLength: 50 });

describe("MessageFilter", () => {
  describe("Property 12: LLM 历史消息过滤", () => {
    /**
     * 属性 12：LLM 历史消息过滤
     * 对于任意包含增强过程消息的历史记录，发送给对话 LLM 时应该过滤掉
     * type 为 "user_original"、"reviewer"、"questioner"、"expert"、"user_answer" 的消息
     * 验证：需求 6.6, 6.7
     */

    it("过滤后的消息不包含增强过程类型", () => {
      fc.assert(
        fc.property(messagesArbitrary, (messages) => {
          const filtered = filterMessagesForLLM(messages as FlatMessage[]);

          // 验证过滤后的消息不包含任何增强过程类型
          for (const msg of filtered) {
            expect(ENHANCE_PROCESS_TYPES).not.toContain(msg.type);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("过滤后保留所有非增强过程类型的消息", () => {
      fc.assert(
        fc.property(messagesArbitrary, (messages) => {
          const filtered = filterMessagesForLLM(messages as FlatMessage[]);

          // 计算原始消息中应该保留的消息数量
          const expectedCount = messages.filter(
            (msg) => !ENHANCE_PROCESS_TYPES.includes(msg.type)
          ).length;

          expect(filtered.length).toBe(expectedCount);
        }),
        { numRuns: 100 }
      );
    });

    it("过滤保持消息顺序不变", () => {
      fc.assert(
        fc.property(messagesArbitrary, (messages) => {
          const filtered = filterMessagesForLLM(messages as FlatMessage[]);

          // 手动过滤并比较
          const expected = messages.filter((msg) => !ENHANCE_PROCESS_TYPES.includes(msg.type));

          expect(filtered.length).toBe(expected.length);
          for (let i = 0; i < filtered.length; i++) {
            expect(filtered[i].id).toBe(expected[i].id);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("enhancer 类型消息应该被保留", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1 }),
              role: fc.constant("assistant") as fc.Arbitrary<"assistant">,
              type: fc.constant("enhancer") as fc.Arbitrary<"enhancer">,
              content: fc.string(),
              createdAt: fc.date(),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (enhancerMessages) => {
            const filtered = filterMessagesForLLM(enhancerMessages as FlatMessage[]);

            // enhancer 类型应该全部保留
            expect(filtered.length).toBe(enhancerMessages.length);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("空消息列表返回空数组", () => {
      const result = filterMessagesForLLM([]);
      expect(result).toEqual([]);
    });
  });

  describe("isEnhanceProcessType", () => {
    it("正确识别增强过程类型", () => {
      for (const type of ENHANCE_PROCESS_TYPES) {
        expect(isEnhanceProcessType(type)).toBe(true);
      }
    });

    it("正确识别非增强过程类型", () => {
      for (const type of PRESERVED_TYPES) {
        expect(isEnhanceProcessType(type)).toBe(false);
      }
    });
  });
});
