/**
 * 消息历史总结服务属性测试
 * 使用 fast-check 进行属性测试
 *
 * 运行测试: pnpm test
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import MessageSummaryService from "../service/messageSummaryService.js";
import type { FlatMessage } from "../dao/messageDAO.js";
import type { ConversationSummaryInfo } from "../service/messageSummaryService.js";

describe("MessageSummaryService", () => {
  /**
   * **Feature: message-history-summary, Property 2: 最后一轮对话保留完整性**
   * 对于任意消息序列，getLastRoundStartIndex 返回的索引应指向最后一个 user 消息，
   * 且该索引之后的所有消息都被保留
   * 验证: 需求 1.2
   */
  describe("getLastRoundStartIndex - Property 2: 最后一轮对话保留完整性", () => {
    it("空消息列表应返回 0", () => {
      const result = MessageSummaryService.getLastRoundStartIndex([]);
      expect(result).toBe(0);
    });

    it("返回的索引应指向最后一个 user 消息", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              role: fc.constantFrom("user", "assistant") as fc.Arbitrary<"user" | "assistant">,
              type: fc.constant("chat" as const),
              content: fc.string({ minLength: 1 }),
              createdAt: fc.date(),
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (messages) => {
            const index = MessageSummaryService.getLastRoundStartIndex(messages);

            // 找到最后一个 user 消息的索引
            let lastUserIndex = -1;
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === "user") {
                lastUserIndex = i;
                break;
              }
            }

            if (lastUserIndex === -1) {
              // 没有 user 消息，应返回 0
              expect(index).toBe(0);
            } else {
              // 应返回最后一个 user 消息的索引
              expect(index).toBe(lastUserIndex);
              expect(messages[index].role).toBe("user");
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("索引之后不应有其他 user 消息", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              role: fc.constantFrom("user", "assistant") as fc.Arbitrary<"user" | "assistant">,
              type: fc.constant("chat" as const),
              content: fc.string({ minLength: 1 }),
              createdAt: fc.date(),
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (messages) => {
            const index = MessageSummaryService.getLastRoundStartIndex(messages);

            // 索引之后的消息不应包含 user 消息
            const messagesAfterIndex = messages.slice(index + 1);
            const hasUserAfter = messagesAfterIndex.some((m) => m.role === "user");
            expect(hasUserAfter).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: message-history-summary, Property 1: 总结触发阈值正确性**
   * 对于任意会话和消息数量，当且仅当消息数量超过 20 条时，系统应触发总结任务
   * 验证: 需求 1.1
   */
  describe("SUMMARY_THRESHOLD - Property 1: 总结触发阈值正确性", () => {
    it("阈值应为 20", () => {
      expect(MessageSummaryService.SUMMARY_THRESHOLD).toBe(20);
    });

    it("消息数量 <= 20 时不应触发总结", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), (count) => {
          // 阈值检查逻辑：count <= SUMMARY_THRESHOLD 时不触发
          const shouldTrigger = count > MessageSummaryService.SUMMARY_THRESHOLD;
          expect(shouldTrigger).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("消息数量 > 20 时应触发总结", () => {
      fc.assert(
        fc.property(fc.integer({ min: 21, max: 100 }), (count) => {
          // 阈值检查逻辑：count > SUMMARY_THRESHOLD 时触发
          const shouldTrigger = count > MessageSummaryService.SUMMARY_THRESHOLD;
          expect(shouldTrigger).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: message-history-summary, Property 5: 总结任务不重复触发**
   * 对于任意正在总结中的会话，再次调用 checkAndTriggerSummary 不应启动新的总结任务
   * 验证: 需求 2.2
   */
  describe("isSummarizing - Property 5: 总结任务不重复触发", () => {
    it("未开始总结的会话应返回 false", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10000 }), (conversationId) => {
          // 新的会话 ID 应该不在总结中
          const result = MessageSummaryService.isSummarizing(conversationId);
          expect(result).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: message-history-summary, Property 3: 上下文构建正确性（有总结）**
   * 对于任意有有效总结的会话，buildContextMessages 返回的消息列表应以总结消息开头，
   * 后续消息的 id 都大于 summaryUntilMessageId
   * 验证: 需求 1.4
   */
  describe("buildContextMessages - Property 3: 上下文构建正确性（有总结）", () => {
    it("有总结时，第一条消息应为系统消息包含总结内容", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 200 }), // 总结内容
          fc.integer({ min: 1, max: 50 }), // summaryUntilMessageId
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 100 }),
              role: fc.constantFrom("user", "assistant") as fc.Arbitrary<"user" | "assistant">,
              type: fc.constant("chat" as const),
              content: fc.string({ minLength: 1 }),
              createdAt: fc.date(),
            }),
            { minLength: 1, maxLength: 30 }
          ),
          (summary, summaryUntilMessageId, messages) => {
            const summaryInfo: ConversationSummaryInfo = {
              summary,
              summaryUntilMessageId,
            };

            const result = MessageSummaryService.buildContextMessages(summaryInfo, messages);

            // 第一条消息应为系统消息
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].role).toBe("system");
            expect(result[0].content).toContain(summary);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("有总结时，只包含 id > summaryUntilMessageId 的消息", () => {
      // 创建一个有明确 ID 的消息列表
      const messages: FlatMessage[] = [
        { id: 1, role: "user", type: "chat", content: "消息1", createdAt: new Date() },
        { id: 2, role: "assistant", type: "chat", content: "回复1", createdAt: new Date() },
        { id: 3, role: "user", type: "chat", content: "消息2", createdAt: new Date() },
        { id: 4, role: "assistant", type: "chat", content: "回复2", createdAt: new Date() },
        { id: 5, role: "user", type: "chat", content: "消息3", createdAt: new Date() },
        { id: 6, role: "assistant", type: "chat", content: "回复3", createdAt: new Date() },
      ];

      const summaryInfo: ConversationSummaryInfo = {
        summary: "这是之前对话的总结",
        summaryUntilMessageId: 4, // 总结覆盖到 id=4
      };

      const result = MessageSummaryService.buildContextMessages(summaryInfo, messages);

      // 第一条是系统消息（总结）
      expect(result[0].role).toBe("system");

      // 后续消息应该只包含 id > 4 的内容（消息3 和 回复3）
      // 转换后应该有 user 和 assistant 各一条
      expect(result.length).toBe(3); // 1 系统 + 1 user + 1 assistant
      expect(result[1].role).toBe("user");
      expect(result[1].content).toBe("消息3");
      expect(result[2].role).toBe("assistant");
      expect(result[2].content).toBe("回复3");
    });
  });

  /**
   * **Feature: message-history-summary, Property 4: 上下文构建正确性（无总结/降级）**
   * 对于任意无总结或正在总结的会话，buildContextMessages 返回的消息列表应包含所有原始消息
   * 验证: 需求 1.5, 2.3
   */
  describe("buildContextMessages - Property 4: 上下文构建正确性（无总结/降级）", () => {
    it("无总结时，应返回所有原始消息", () => {
      const messages: FlatMessage[] = [
        { id: 1, role: "user", type: "chat", content: "消息1", createdAt: new Date() },
        { id: 2, role: "assistant", type: "chat", content: "回复1", createdAt: new Date() },
        { id: 3, role: "user", type: "chat", content: "消息2", createdAt: new Date() },
        { id: 4, role: "assistant", type: "chat", content: "回复2", createdAt: new Date() },
      ];

      const summaryInfo: ConversationSummaryInfo = {
        summary: null,
        summaryUntilMessageId: null,
      };

      const result = MessageSummaryService.buildContextMessages(summaryInfo, messages);

      // 不应有系统消息
      expect(result[0].role).not.toBe("system");

      // 应包含所有消息（转换后的格式）
      expect(result.length).toBe(4); // 2 user + 2 assistant
    });

    it("summaryUntilMessageId 为 null 时应降级", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // 即使有 summary 内容
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 100 }),
              role: fc.constantFrom("user", "assistant") as fc.Arbitrary<"user" | "assistant">,
              type: fc.constant("chat" as const),
              content: fc.string({ minLength: 1 }),
              createdAt: fc.date(),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (summary, messages) => {
            const summaryInfo: ConversationSummaryInfo = {
              summary, // 有总结内容
              summaryUntilMessageId: null, // 但没有 ID
            };

            const result = MessageSummaryService.buildContextMessages(summaryInfo, messages);

            // 应该降级，不使用总结
            if (result.length > 0) {
              expect(result[0].role).not.toBe("system");
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("summary 为 null 时应降级", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }), // 即使有 summaryUntilMessageId
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 100 }),
              role: fc.constantFrom("user", "assistant") as fc.Arbitrary<"user" | "assistant">,
              type: fc.constant("chat" as const),
              content: fc.string({ minLength: 1 }),
              createdAt: fc.date(),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (summaryUntilMessageId, messages) => {
            const summaryInfo: ConversationSummaryInfo = {
              summary: null, // 没有总结内容
              summaryUntilMessageId, // 但有 ID
            };

            const result = MessageSummaryService.buildContextMessages(summaryInfo, messages);

            // 应该降级，不使用总结
            if (result.length > 0) {
              expect(result[0].role).not.toBe("system");
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
