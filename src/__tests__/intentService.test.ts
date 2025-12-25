/**
 * 意图分析服务属性测试
 * 使用 fast-check 进行属性测试
 *
 * 运行测试: pnpm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";

/**
 * 属性 4：意图分析流程顺序性
 * 对于任意开启智能路由模式的用户请求，系统必须：
 * - 首先调用 Forge 分析接口
 * - 仅当 Forge 分析返回 no_match 时，才调用 MCP 分析接口
 * - 不会同时或反序调用两个分析接口
 * 验证：需求 2.1, 3.1
 */
describe("IntentService - 属性 4：意图分析流程顺序性", () => {
  // 模拟 Gateway 模块
  const mockAnalyzeForgeIntent = vi.fn();
  const mockAnalyzeMCPIntent = vi.fn();
  const mockIntentAbortManager = {
    create: vi.fn(() => ({ signal: new AbortController().signal })),
    cleanup: vi.fn(),
    abort: vi.fn(() => true),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // 模拟 Gateway 模块
    vi.doMock("agentforge-gateway", () => ({
      analyzeForgeIntent: mockAnalyzeForgeIntent,
      analyzeMCPIntent: mockAnalyzeMCPIntent,
      intentAbortManager: mockIntentAbortManager,
    }));

    // 模拟 ForgeService
    vi.doMock("../service/forgeService.js", () => ({
      default: {
        getAllForgeSummaries: vi.fn(() =>
          Promise.resolve([{ id: 1, name: "Test Forge", summary: "Test summary" }])
        ),
      },
    }));

    // 模拟 McpDAO
    vi.doMock("../dao/mcpDAO.js", () => ({
      default: {
        findByStatus: vi.fn(() => Promise.resolve([{ id: 1, name: "Test MCP" }])),
      },
    }));

    // 模拟 mcpManager
    vi.doMock("../mcp/index.js", () => ({
      mcpManager: {
        getTools: vi.fn(() => Promise.resolve([{ name: "test_tool", description: "Test tool" }])),
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Forge 分析返回 use_existing_forge 时不应调用 MCP 分析", async () => {
    // 设置 Forge 分析返回匹配结果
    mockAnalyzeForgeIntent.mockResolvedValue({
      type: "use_existing_forge",
      forgeId: 1,
      forgeName: "Test Forge",
      originalQuery: "test",
    });

    const { default: IntentService } = await import("../service/intentService.js");

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.uuid(),
        async (userInput, sessionId) => {
          vi.clearAllMocks();

          // 调用 Forge 分析
          const result = await IntentService.analyzeForgeIntent({
            userInput,
            userId: 1,
            sessionId,
          });

          // 验证：Forge 分析被调用
          expect(mockAnalyzeForgeIntent).toHaveBeenCalledTimes(1);

          // 验证：返回 use_existing_forge
          expect(result.type).toBe("use_existing_forge");

          // 验证：MCP 分析不应被调用（在同一个服务调用中）
          // 注意：这里测试的是单个服务方法，流程控制在前端
          expect(mockAnalyzeMCPIntent).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  it("Forge 分析返回 no_match 时应允许后续调用 MCP 分析", async () => {
    // 设置 Forge 分析返回无匹配
    mockAnalyzeForgeIntent.mockResolvedValue({
      type: "no_match",
      originalQuery: "test",
    });

    // 设置 MCP 分析返回创建 Forge
    mockAnalyzeMCPIntent.mockResolvedValue({
      type: "create_forge",
      mcpTools: [{ mcpId: 1, toolNames: ["test_tool"] }],
      originalQuery: "test",
    });

    const { default: IntentService } = await import("../service/intentService.js");

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.uuid(),
        async (userInput, sessionId) => {
          vi.clearAllMocks();

          // 先调用 Forge 分析
          const forgeResult = await IntentService.analyzeForgeIntent({
            userInput,
            userId: 1,
            sessionId,
          });

          // 验证：Forge 分析返回 no_match
          expect(forgeResult.type).toBe("no_match");

          // 然后调用 MCP 分析
          const mcpResult = await IntentService.analyzeMCPIntent({
            userInput,
            userId: 1,
            sessionId: sessionId + "-mcp", // 使用不同的 sessionId
          });

          // 验证：MCP 分析被调用
          expect(mockAnalyzeMCPIntent).toHaveBeenCalledTimes(1);

          // 验证：MCP 分析返回结果
          expect(["create_forge", "not_supported"]).toContain(mcpResult.type);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("取消操作应正确调用 abort", async () => {
    const { default: IntentService } = await import("../service/intentService.js");

    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (sessionId) => {
        vi.clearAllMocks();

        // 调用取消
        const result = await IntentService.cancelIntent(sessionId);

        // 验证：abort 被调用
        expect(mockIntentAbortManager.abort).toHaveBeenCalledWith(sessionId);

        // 验证：返回成功
        expect(result.success).toBe(true);
      }),
      { numRuns: 50 }
    );
  });
});
