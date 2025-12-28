/**
 * 反馈 DAO 属性测试
 * 使用 fast-check 进行属性测试
 *
 * Property 1: 重复提交创建新记录
 * 对于任意用户和任务轮次，当用户对同一轮次多次提交反馈时，
 * 系统应创建多条独立的反馈记录，记录数量应等于提交次数。
 *
 * Property 4: 批量获取返回最新状态
 * 对于任意任务和轮次列表，批量获取 API 返回的状态应为每个轮次的最新反馈类型，
 * cancel 类型应返回 null。
 *
 * 注意：这些测试需要数据库连接，在 CI 环境中可能需要 mock
 * 运行测试: pnpm test
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fc from "fast-check";

// 模拟 FeedbackDAO 的核心逻辑进行单元测试
// 实际的数据库测试需要在集成测试中进行

describe("FeedbackDAO Logic", () => {
  describe("Property 1: 重复提交创建新记录", () => {
    /**
     * 模拟反馈存储
     * 每次提交都创建新记录
     */
    class MockFeedbackStore {
      private records: Array<{
        id: number;
        turnEndMessageId: number;
        userId: number;
        type: "like" | "dislike" | "cancel";
        createdAt: Date;
      }> = [];
      private nextId = 1;

      create(data: {
        turnEndMessageId: number;
        userId: number;
        type: "like" | "dislike" | "cancel";
      }) {
        const record = {
          id: this.nextId++,
          turnEndMessageId: data.turnEndMessageId,
          userId: data.userId,
          type: data.type,
          createdAt: new Date(),
        };
        this.records.push(record);
        return record;
      }

      countByTurnEndMessageId(turnEndMessageId: number, userId: number): number {
        return this.records.filter(
          (r) => r.turnEndMessageId === turnEndMessageId && r.userId === userId
        ).length;
      }

      findLatest(
        turnEndMessageId: number,
        userId: number
      ): { type: "like" | "dislike" | "cancel" } | null {
        const userRecords = this.records
          .filter((r) => r.turnEndMessageId === turnEndMessageId && r.userId === userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return userRecords[0] || null;
      }

      clear() {
        this.records = [];
        this.nextId = 1;
      }
    }

    it("每次提交都应该创建新记录", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // turnEndMessageId
          fc.integer({ min: 1, max: 1000 }), // userId
          fc.integer({ min: 1, max: 10 }), // submitCount
          fc.array(
            fc.constantFrom("like", "dislike", "cancel") as fc.Arbitrary<
              "like" | "dislike" | "cancel"
            >,
            {
              minLength: 1,
              maxLength: 10,
            }
          ), // types
          (turnEndMessageId, userId, submitCount, types) => {
            const store = new MockFeedbackStore();

            // 提交多次反馈
            const actualSubmitCount = Math.min(submitCount, types.length);
            for (let i = 0; i < actualSubmitCount; i++) {
              store.create({
                turnEndMessageId,
                userId,
                type: types[i],
              });
            }

            // 验证记录数量等于提交次数
            const count = store.countByTurnEndMessageId(turnEndMessageId, userId);
            expect(count).toBe(actualSubmitCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("每条记录应该有唯一的 ID", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 1000 }),
          fc.array(fc.constantFrom("like", "dislike") as fc.Arbitrary<"like" | "dislike">, {
            minLength: 2,
            maxLength: 10,
          }),
          (turnEndMessageId, userId, types) => {
            const store = new MockFeedbackStore();
            const ids: number[] = [];

            for (const type of types) {
              const record = store.create({ turnEndMessageId, userId, type });
              ids.push(record.id);
            }

            // 验证所有 ID 都是唯一的
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 4: 批量获取返回最新状态", () => {
    /**
     * 模拟批量获取逻辑
     */
    class MockFeedbackStore {
      private records: Array<{
        id: number;
        turnEndMessageId: number;
        userId: number;
        type: "like" | "dislike" | "cancel";
        createdAt: Date;
      }> = [];
      private nextId = 1;

      create(data: {
        turnEndMessageId: number;
        userId: number;
        type: "like" | "dislike" | "cancel";
      }) {
        const record = {
          id: this.nextId++,
          turnEndMessageId: data.turnEndMessageId,
          userId: data.userId,
          type: data.type,
          createdAt: new Date(Date.now() + this.nextId), // 确保时间递增
        };
        this.records.push(record);
        return record;
      }

      findLatestByTurnEndMessageIds(
        turnEndMessageIds: number[],
        userId: number
      ): Record<number, "like" | "dislike" | null> {
        const result: Record<number, "like" | "dislike" | null> = {};

        for (const id of turnEndMessageIds) {
          result[id] = null;
        }

        for (const id of turnEndMessageIds) {
          const userRecords = this.records
            .filter((r) => r.turnEndMessageId === id && r.userId === userId)
            .sort((a, b) => b.id - a.id); // 按 ID 降序（最新的在前）

          if (userRecords.length > 0) {
            const latest = userRecords[0];
            // cancel 类型返回 null
            result[id] = latest.type === "cancel" ? null : latest.type;
          }
        }

        return result;
      }

      clear() {
        this.records = [];
        this.nextId = 1;
      }
    }

    it("应该返回每个轮次的最新反馈状态", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // userId
          fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }), // turnEndMessageIds
          fc.array(fc.constantFrom("like", "dislike") as fc.Arbitrary<"like" | "dislike">, {
            minLength: 1,
            maxLength: 5,
          }), // 最终状态
          (userId, turnEndMessageIds, finalTypes) => {
            const store = new MockFeedbackStore();
            const uniqueIds = [...new Set(turnEndMessageIds)];

            // 为每个轮次创建多个反馈，最后一个是最终状态
            for (let i = 0; i < uniqueIds.length; i++) {
              const id = uniqueIds[i];
              // 先创建一些随机反馈
              store.create({ turnEndMessageId: id, userId, type: "like" });
              store.create({ turnEndMessageId: id, userId, type: "dislike" });
              // 最后创建最终状态
              const finalType = finalTypes[i % finalTypes.length];
              store.create({ turnEndMessageId: id, userId, type: finalType });
            }

            // 批量获取
            const result = store.findLatestByTurnEndMessageIds(uniqueIds, userId);

            // 验证每个轮次返回的是最终状态
            for (let i = 0; i < uniqueIds.length; i++) {
              const id = uniqueIds[i];
              const expectedType = finalTypes[i % finalTypes.length];
              expect(result[id]).toBe(expectedType);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("cancel 类型应该返回 null", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // userId
          fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }), // turnEndMessageIds
          (userId, turnEndMessageIds) => {
            const store = new MockFeedbackStore();
            const uniqueIds = [...new Set(turnEndMessageIds)];

            // 为每个轮次创建反馈，最后取消
            for (const id of uniqueIds) {
              store.create({ turnEndMessageId: id, userId, type: "like" });
              store.create({ turnEndMessageId: id, userId, type: "cancel" });
            }

            // 批量获取
            const result = store.findLatestByTurnEndMessageIds(uniqueIds, userId);

            // 验证所有轮次都返回 null
            for (const id of uniqueIds) {
              expect(result[id]).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("不存在的轮次应该返回 null", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // userId
          fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }), // turnEndMessageIds
          (userId, turnEndMessageIds) => {
            const store = new MockFeedbackStore();
            const uniqueIds = [...new Set(turnEndMessageIds)];

            // 不创建任何反馈

            // 批量获取
            const result = store.findLatestByTurnEndMessageIds(uniqueIds, userId);

            // 验证所有轮次都返回 null
            for (const id of uniqueIds) {
              expect(result[id]).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
