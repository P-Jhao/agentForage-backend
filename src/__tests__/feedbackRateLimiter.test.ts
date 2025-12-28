/**
 * 反馈节流控制服务属性测试
 * 使用 fast-check 进行属性测试
 *
 * Property 2: 节流控制
 * 对于任意用户，在 60 秒时间窗口内，当提交反馈次数超过 5 次时，
 * 后续请求应返回 false；当时间窗口过期后，应允许新的提交。
 *
 * 运行测试: pnpm test
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import FeedbackRateLimiter from "../service/feedbackRateLimiter.js";

describe("FeedbackRateLimiter", () => {
  beforeEach(() => {
    // 每个测试前清空记录
    FeedbackRateLimiter.clearAll();
  });

  afterEach(() => {
    // 每个测试后停止清理定时器
    FeedbackRateLimiter.stopCleanupTimer();
  });

  describe("Property 2: 节流控制", () => {
    /**
     * 属性：前 5 次请求应该被允许
     * 对于任意用户 ID，前 5 次调用 checkLimit 应该返回 true
     */
    it("前 5 次请求应该被允许", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10000 }), (userId) => {
          // 清空该用户的记录
          FeedbackRateLimiter.clearAll();

          // 前 5 次请求都应该被允许
          for (let i = 0; i < 5; i++) {
            expect(FeedbackRateLimiter.checkLimit(userId)).toBe(true);
            FeedbackRateLimiter.recordRequest(userId);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * 属性：第 6 次及之后的请求应该被拒绝
     * 对于任意用户 ID，在记录 5 次请求后，checkLimit 应该返回 false
     */
    it("第 6 次及之后的请求应该被拒绝", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          fc.integer({ min: 1, max: 10 }),
          (userId, extraRequests) => {
            // 清空该用户的记录
            FeedbackRateLimiter.clearAll();

            // 先记录 5 次请求
            for (let i = 0; i < 5; i++) {
              FeedbackRateLimiter.recordRequest(userId);
            }

            // 第 6 次及之后的请求应该被拒绝
            for (let i = 0; i < extraRequests; i++) {
              expect(FeedbackRateLimiter.checkLimit(userId)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * 属性：不同用户之间的限制是独立的
     * 对于任意两个不同的用户 ID，一个用户达到限制不应影响另一个用户
     */
    it("不同用户之间的限制是独立的", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5000 }),
          fc.integer({ min: 5001, max: 10000 }),
          (userId1, userId2) => {
            // 清空所有记录
            FeedbackRateLimiter.clearAll();

            // 用户 1 达到限制
            for (let i = 0; i < 5; i++) {
              FeedbackRateLimiter.recordRequest(userId1);
            }

            // 用户 1 应该被拒绝
            expect(FeedbackRateLimiter.checkLimit(userId1)).toBe(false);

            // 用户 2 应该仍然被允许
            expect(FeedbackRateLimiter.checkLimit(userId2)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * 属性：请求计数应该准确
     * 对于任意用户 ID 和请求次数，getRequestCount 应该返回正确的计数
     */
    it("请求计数应该准确", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          fc.integer({ min: 0, max: 10 }),
          (userId, requestCount) => {
            // 清空该用户的记录
            FeedbackRateLimiter.clearAll();

            // 记录指定次数的请求
            for (let i = 0; i < requestCount; i++) {
              FeedbackRateLimiter.recordRequest(userId);
            }

            // 验证计数
            expect(FeedbackRateLimiter.getRequestCount(userId)).toBe(requestCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("边界情况", () => {
    it("新用户的第一次请求应该被允许", () => {
      const userId = 99999;
      expect(FeedbackRateLimiter.checkLimit(userId)).toBe(true);
    });

    it("清空后用户可以重新请求", () => {
      const userId = 12345;

      // 达到限制
      for (let i = 0; i < 5; i++) {
        FeedbackRateLimiter.recordRequest(userId);
      }
      expect(FeedbackRateLimiter.checkLimit(userId)).toBe(false);

      // 清空后应该可以重新请求
      FeedbackRateLimiter.clearAll();
      expect(FeedbackRateLimiter.checkLimit(userId)).toBe(true);
    });

    it("恰好 5 次请求后仍然被允许，第 6 次被拒绝", () => {
      const userId = 11111;

      // 记录 5 次请求
      for (let i = 0; i < 5; i++) {
        expect(FeedbackRateLimiter.checkLimit(userId)).toBe(true);
        FeedbackRateLimiter.recordRequest(userId);
      }

      // 第 6 次应该被拒绝
      expect(FeedbackRateLimiter.checkLimit(userId)).toBe(false);
    });
  });

  describe("配置常量", () => {
    it("时间窗口应该是 60 秒", () => {
      expect(FeedbackRateLimiter.RATE_LIMIT_WINDOW_MS).toBe(60 * 1000);
    });

    it("最大请求次数应该是 5", () => {
      expect(FeedbackRateLimiter.RATE_LIMIT_MAX_REQUESTS).toBe(5);
    });
  });
});
