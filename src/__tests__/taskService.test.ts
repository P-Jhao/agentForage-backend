/**
 * 任务服务属性测试
 * 使用 fast-check 进行属性测试
 *
 * 运行测试: pnpm test
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { truncateTitle } from "../service/taskService.js";

describe("TaskService", () => {
  describe("truncateTitle - 属性 2：标题截断正确性", () => {
    /**
     * 属性 2：标题截断正确性
     * 对于任意长度的用户消息，生成的任务标题长度应不超过 20 个字符，
     * 且为原消息的前缀（或完整消息，如果长度 ≤ 20）
     * 验证：需求 1.3
     */
    it("截断后的标题长度不超过 23 个字符（20 + 省略号）", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = truncateTitle(input);
          // 最大长度为 20 + "..." = 23
          expect(result.length).toBeLessThanOrEqual(23);
        }),
        { numRuns: 100 }
      );
    });

    it("短文本（≤20字符）应保持不变", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          (input) => {
            const trimmed = input.trim();
            if (trimmed.length <= 20) {
              const result = truncateTitle(input);
              expect(result).toBe(trimmed);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("长文本（>20字符）应截断并添加省略号", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 21, maxLength: 100 }), (input) => {
          const trimmed = input.trim();
          if (trimmed.length > 20) {
            const result = truncateTitle(input);
            expect(result).toBe(trimmed.slice(0, 20) + "...");
            expect(result.endsWith("...")).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("截断后的内容是原文本的前缀", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (input) => {
          const trimmed = input.trim();
          if (trimmed.length === 0) return; // 跳过空字符串

          const result = truncateTitle(input);
          // 移除可能的省略号后，应该是原文本的前缀
          const withoutEllipsis = result.replace(/\.\.\.$/, "");
          expect(trimmed.startsWith(withoutEllipsis)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("空字符串或纯空白应返回默认标题", () => {
      expect(truncateTitle("")).toBe("新会话");
      expect(truncateTitle("   ")).toBe("新会话");
    });
  });
});
