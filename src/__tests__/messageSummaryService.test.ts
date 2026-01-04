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
   * **Feature: message-history-summary, Property 2: 保留最近消息完整性**
   * 对于任意消息序列，getKeepRecentStartIndex 返回的索引应保证最近 N 条消息被保留
   * 验证: 需求 1.2
   */
  describe("getKeepRecentStartIndex - Property 2: 保留最近消息完整性", () => {
    it("空消息列表应返回 0", () => {
      const result = MessageSummaryService.getKeepRecentStartIndex([]);
      expect(result).toBe(0);
    });

    it("消息数不足 KEEP_RECENT_COUNT 时应返回 0（全部保留）", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: MessageSummaryService.KEEP_RECENT_COUNT }),
          (count) => {
            const messages: FlatMessage[] = Array.from({ length: count }, (_, i) => ({
              id: i + 1,
              role: i % 2 === 0 ? "user" : "assistant",
              type: "chat" as const,
              content: `消息${i + 1}`,
              createdAt: new Date(),
            }));
            const result = MessageSummaryService.getKeepRecentStartIndex(messages);
            expect(result).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("消息数超过 KEEP_RECENT_COUNT 时应返回正确的起始索引", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MessageSummaryService.KEEP_RECENT_COUNT + 1, max: 100 }),
          (count) => {
            const messages: FlatMessage[] = Array.from({ length: count }, (_, i) => ({
              id: i + 1,
              role: i % 2 === 0 ? "user" : "assistant",
              type: "chat" as const,
              content: `消息${i + 1}`,
              createdAt: new Date(),
            }));
            const result = MessageSummaryService.getKeepRecentStartIndex(messages);
            // 应该保留最后 KEEP_RECENT_COUNT 条
            expect(result).toBe(count - MessageSummaryService.KEEP_RECENT_COUNT);
            // 保留的消息数应该等于 KEEP_RECENT_COUNT
            expect(messages.length - result).toBe(MessageSummaryService.KEEP_RECENT_COUNT);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: message-history-summary, Property 1: 总结触发阈值正确性**
   * 对于任意消息列表，当 token 超限 OR 消息数超限时应触发总结
   * 验证: 需求 1.1
   */
  describe("shouldTriggerSummary - Property 1: 总结触发阈值正确性", () => {
    it("阈值配置应正确", () => {
      expect(MessageSummaryService.TOKEN_THRESHOLD).toBe(8000);
      expect(MessageSummaryService.MESSAGE_THRESHOLD).toBe(50);
      expect(MessageSummaryService.KEEP_RECENT_COUNT).toBe(10);
    });

    it("空消息列表不应触发总结", () => {
      const result = MessageSummaryService.shouldTriggerSummary([]);
      expect(result).toBe(false);
    });

    it("消息数超过阈值时应触发总结", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MessageSummaryService.MESSAGE_THRESHOLD + 1, max: 100 }),
          (count) => {
            // 创建短消息，确保 token 不超限，只靠消息数触发
            const messages: FlatMessage[] = Array.from({ length: count }, (_, i) => ({
              id: i + 1,
              role: "user" as const,
              type: "chat" as const,
              content: "短", // 很短的内容
              createdAt: new Date(),
            }));
            const result = MessageSummaryService.shouldTriggerSummary(messages);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("token 超过阈值时应触发总结（即使消息数少）", () => {
      // 创建少量但很长的消息，使 token 超限
      const longContent = "这是一段很长的内容".repeat(2000); // 约 18000 字符 = 9000 token
      const messages: FlatMessage[] = [
        { id: 1, role: "user", type: "chat", content: longContent, createdAt: new Date() },
      ];
      const result = MessageSummaryService.shouldTriggerSummary(messages);
      expect(result).toBe(true);
    });

    it("消息数和 token 都未超限时不应触发总结", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: MessageSummaryService.MESSAGE_THRESHOLD }),
          (count) => {
            // 创建短消息，确保 token 和消息数都不超限
            const messages: FlatMessage[] = Array.from({ length: count }, (_, i) => ({
              id: i + 1,
              role: "user" as const,
              type: "chat" as const,
              content: "短消息", // 6 字符 = 3 token
              createdAt: new Date(),
            }));
            // 50 条 * 3 token = 150 token，远低于 8000
            const result = MessageSummaryService.shouldTriggerSummary(messages);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: message-history-summary, Property 6: Token 估算正确性**
   */
  describe("estimateTokens - Property 6: Token 估算正确性", () => {
    it("空消息列表应返回 0", () => {
      const result = MessageSummaryService.estimateTokens([]);
      expect(result).toBe(0);
    });

    it("token 估算应约为字符数的一半", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              role: fc.constantFrom("user", "assistant") as fc.Arbitrary<"user" | "assistant">,
              type: fc.constant("chat" as const),
              content: fc.string({ minLength: 1, maxLength: 100 }),
              createdAt: fc.date(),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (messages) => {
            const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
            const expectedTokens = Math.ceil(totalChars / 2);
            const result = MessageSummaryService.estimateTokens(messages);
            expect(result).toBe(expectedTokens);
          }
        ),
        { numRuns: 50 }
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
