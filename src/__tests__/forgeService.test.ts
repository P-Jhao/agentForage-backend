/**
 * Forge 服务属性测试
 * 使用 fast-check 进行属性测试
 *
 * 运行测试: pnpm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";

/**
 * 属性 5：Forge 摘要异步生成不阻塞
 * 对于任意 Forge 创建或修改操作，操作应该在摘要生成完成前返回成功响应，
 * 摘要生成应该在后台异步完成。
 * 验证：需求 4.5
 */
describe("ForgeService - 属性 5：Forge 摘要异步生成不阻塞", () => {
  // 模拟 setImmediate 的回调收集
  let immediateCallbacks: Array<() => void> = [];
  let originalSetImmediate: typeof setImmediate;

  // 生成符合 ToolInfo 类型的工具数据
  const toolInfoArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ maxLength: 200 }),
    inputSchema: fc.constant({} as Record<string, unknown>),
  });

  // 生成 MCP 工具选择数据
  const mcpToolSelectionArb = fc.record({
    mcpId: fc.integer({ min: 1, max: 100 }),
    tools: fc.array(toolInfoArb, { minLength: 1, maxLength: 5 }),
  });

  beforeEach(() => {
    immediateCallbacks = [];
    originalSetImmediate = global.setImmediate;
    // 替换 setImmediate，收集回调但不立即执行
    global.setImmediate = ((callback: () => void) => {
      immediateCallbacks.push(callback);
      return {} as NodeJS.Immediate;
    }) as typeof setImmediate;
  });

  afterEach(() => {
    global.setImmediate = originalSetImmediate;
    vi.restoreAllMocks();
  });

  it("triggerSummaryGeneration 应该使用 setImmediate 异步执行", async () => {
    // 动态导入以确保使用模拟的 setImmediate
    const { default: ForgeService } = await import("../service/forgeService.js");

    // 生成随机的 MCP 工具数据
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        fc.array(mcpToolSelectionArb, { minLength: 1, maxLength: 3 }),
        async (forgeId, mcpTools) => {
          immediateCallbacks = [];

          // 调用触发摘要生成
          const startTime = Date.now();
          await ForgeService.triggerSummaryGeneration(forgeId, mcpTools);
          const endTime = Date.now();

          // 验证：方法应该立即返回（不阻塞）
          // 由于我们模拟了 setImmediate，实际的摘要生成不会执行
          expect(endTime - startTime).toBeLessThan(100);

          // 验证：应该有一个 setImmediate 回调被注册
          expect(immediateCallbacks.length).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("空 MCP 工具列表不应触发摘要生成", async () => {
    const { default: ForgeService } = await import("../service/forgeService.js");

    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1000 }), async (forgeId) => {
        immediateCallbacks = [];

        // 空数组
        await ForgeService.triggerSummaryGeneration(forgeId, []);
        expect(immediateCallbacks.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it("摘要生成失败不应抛出异常到调用方", async () => {
    const { default: ForgeService } = await import("../service/forgeService.js");

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        fc.array(mcpToolSelectionArb, { minLength: 1, maxLength: 3 }),
        async (forgeId, mcpTools) => {
          // 调用不应抛出异常
          await expect(
            ForgeService.triggerSummaryGeneration(forgeId, mcpTools)
          ).resolves.toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
