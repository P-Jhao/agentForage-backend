/**
 * 反馈表单验证逻辑测试
 * Property 3: 表单验证逻辑
 * Validates: Requirements 2.10, 2.11, 2.12, 2.13
 *
 * 注意：这是前端表单验证逻辑的纯函数测试，放在后端是因为前端没有配置测试框架
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";

// 点赞标签选项
const LIKE_TAGS = ["回答准确", "理解到位", "工具使用恰当", "响应速度快", "思路清晰", "其他"];

// 踩标签选项
const DISLIKE_TAGS = ["回答不准确", "理解有偏差", "工具调用失败", "响应太慢", "逻辑混乱", "其他"];

/**
 * 计算提交按钮是否禁用
 * 规则：
 * - 未选择标签且未填写内容 → 禁用
 * - 只选择"其他"标签且未填写内容 → 禁用
 * - 选择了非"其他"标签 → 可用
 * - 填写了内容（无论标签选择） → 可用
 */
function isSubmitDisabled(selectedTags: string[], content: string): boolean {
  const hasContent = content.trim().length > 0;
  const hasNonOtherTag = selectedTags.some((tag) => tag !== "其他");

  // 有内容则可提交
  if (hasContent) return false;

  // 没有内容时，必须有非"其他"标签
  return !hasNonOtherTag;
}

describe("FeedbackModal 表单验证逻辑", () => {
  describe("Property 3: 表单验证逻辑", () => {
    it("未选择标签且未填写内容 → 提交按钮禁用", () => {
      fc.assert(
        fc.property(
          // 生成空白或只有空格的内容
          fc.nat({ max: 10 }).map((n) => " ".repeat(n)),
          (content) => {
            const selectedTags: string[] = [];
            expect(isSubmitDisabled(selectedTags, content)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('只选择"其他"标签且未填写内容 → 提交按钮禁用', () => {
      fc.assert(
        fc.property(
          // 生成空白或只有空格的内容
          fc.nat({ max: 10 }).map((n) => " ".repeat(n)),
          (content) => {
            const selectedTags = ["其他"];
            expect(isSubmitDisabled(selectedTags, content)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('选择了非"其他"标签 → 提交按钮可用（无论内容）', () => {
      // 非"其他"的点赞标签
      const nonOtherLikeTags = LIKE_TAGS.filter((tag) => tag !== "其他");
      // 非"其他"的踩标签
      const nonOtherDislikeTags = DISLIKE_TAGS.filter((tag) => tag !== "其他");
      const allNonOtherTags = [...nonOtherLikeTags, ...nonOtherDislikeTags];

      fc.assert(
        fc.property(
          // 从非"其他"标签中选择至少一个
          fc.subarray(allNonOtherTags, { minLength: 1 }),
          // 可能包含"其他"标签
          fc.boolean(),
          // 任意内容（包括空）
          fc.string(),
          (tags, includeOther, content) => {
            const selectedTags = includeOther ? [...tags, "其他"] : tags;
            expect(isSubmitDisabled(selectedTags, content)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("填写了内容 → 提交按钮可用（无论标签选择）", () => {
      const allTags = [...LIKE_TAGS, ...DISLIKE_TAGS];

      fc.assert(
        fc.property(
          // 任意标签组合（包括空）
          fc.subarray(allTags),
          // 非空内容（至少有一个非空格字符）
          fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          (selectedTags, content) => {
            expect(isSubmitDisabled(selectedTags, content)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("边界情况：只有空格的内容视为空", () => {
      fc.assert(
        fc.property(
          // 生成只有空格的字符串
          fc.nat({ max: 10 }).map((n) => " ".repeat(n)),
          (content) => {
            // 没有标签，只有空格内容 → 禁用
            expect(isSubmitDisabled([], content)).toBe(true);
            // 只有"其他"标签，只有空格内容 → 禁用
            expect(isSubmitDisabled(["其他"], content)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("综合测试：所有可能的标签和内容组合", () => {
      const allTags = [...new Set([...LIKE_TAGS, ...DISLIKE_TAGS])]; // 去重

      fc.assert(
        fc.property(fc.subarray(allTags), fc.string(), (selectedTags, content) => {
          const result = isSubmitDisabled(selectedTags, content);
          const hasContent = content.trim().length > 0;
          const hasNonOtherTag = selectedTags.some((tag) => tag !== "其他");

          // 验证逻辑正确性
          if (hasContent) {
            // 有内容 → 可用
            expect(result).toBe(false);
          } else if (hasNonOtherTag) {
            // 没内容但有非"其他"标签 → 可用
            expect(result).toBe(false);
          } else {
            // 没内容且没有非"其他"标签 → 禁用
            expect(result).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
