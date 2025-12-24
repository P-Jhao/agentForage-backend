/**
 * Forge 相关路由
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import ForgeService from "../service/forgeService.js";
import McpDAO from "../dao/mcpDAO.js";
import { mcpManager, type MCPTool } from "../mcp/index.js";
import type { JwtPayload } from "../middleware/tokenAuth.js";

// 动态导入 Gateway
const loadGateway = async () => {
  return await import("agentforge-gateway");
};

const router = new Router();

// Forge 筛选类型
type ForgeFilter = "all" | "my" | "builtin" | "other";

/**
 * 获取 Forge 列表
 * GET /api/forge/list?filter=all|my|builtin|other
 */
router.get("/list", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const filter = (ctx.query.filter as ForgeFilter) || "all";

  // 验证 filter 参数
  if (!["all", "my", "builtin", "other"].includes(filter)) {
    ctx.body = { code: 400, message: "无效的筛选参数", data: null };
    return;
  }

  const result = await ForgeService.getForgeList(filter, user.id);
  ctx.body = { code: 200, message: "ok", data: result };
});

/**
 * 获取用户收藏的 Forge 列表（侧边栏用）
 * GET /api/forge/favorites
 */
router.get("/favorites", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const result = await ForgeService.getFavoriteForges(user.id);
  ctx.body = { code: 200, message: "ok", data: result };
});

/**
 * 获取 Forge 详情
 * GET /api/forge/:id
 */
router.get("/:id", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const id = parseInt(ctx.params.id, 10);

  if (isNaN(id)) {
    ctx.body = { code: 400, message: "无效的 Forge ID", data: null };
    return;
  }

  const result = await ForgeService.getForgeById(id, user);
  ctx.body = { code: 200, message: "ok", data: result };
});

/**
 * 创建 Forge
 * POST /api/forge
 */
router.post("/", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const body = ctx.request.body as {
    displayName?: string;
    description?: string;
    systemPrompt?: string;
    avatar?: string;
    isPublic?: boolean;
    mcpIds?: number[]; // 兼容旧接口
    mcpTools?: Array<{
      // 新接口：MCP 工具选择
      mcpId: number;
      tools: Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>;
    }>;
  };

  // 参数验证
  if (!body.displayName) {
    ctx.body = { code: 400, message: "名称不能为空", data: null };
    return;
  }

  const result = await ForgeService.createForge(
    {
      displayName: body.displayName,
      description: body.description,
      systemPrompt: body.systemPrompt,
      avatar: body.avatar,
      isPublic: body.isPublic,
      mcpIds: body.mcpIds,
      mcpTools: body.mcpTools,
    },
    user
  );

  ctx.body = { code: 200, message: "创建成功", data: result };
});

/**
 * 更新 Forge
 * PUT /api/forge/:id
 */
router.put("/:id", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const id = parseInt(ctx.params.id, 10);

  if (isNaN(id)) {
    ctx.body = { code: 400, message: "无效的 Forge ID", data: null };
    return;
  }

  const body = ctx.request.body as {
    displayName?: string;
    description?: string;
    systemPrompt?: string;
    avatar?: string;
    isPublic?: boolean;
    mcpIds?: number[]; // 兼容旧接口
    mcpTools?: Array<{
      // 新接口：MCP 工具选择
      mcpId: number;
      tools: Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>;
    }>;
  };

  const result = await ForgeService.updateForge(id, body, user);
  ctx.body = { code: 200, message: "更新成功", data: result };
});

/**
 * 删除 Forge
 * DELETE /api/forge/:id
 */
router.delete("/:id", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const id = parseInt(ctx.params.id, 10);

  if (isNaN(id)) {
    ctx.body = { code: 400, message: "无效的 Forge ID", data: null };
    return;
  }

  const result = await ForgeService.deleteForge(id, user);
  ctx.body = { code: 200, message: "删除成功", data: result };
});

/**
 * 收藏/取消收藏 Forge
 * POST /api/forge/:id/favorite
 */
router.post("/:id/favorite", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const id = parseInt(ctx.params.id, 10);

  if (isNaN(id)) {
    ctx.body = { code: 400, message: "无效的 Forge ID", data: null };
    return;
  }

  const body = ctx.request.body as { favorite?: boolean };
  const favorite = body.favorite !== false; // 默认为 true

  const result = await ForgeService.toggleFavorite(id, user.id, favorite);
  ctx.body = { code: 200, message: favorite ? "收藏成功" : "取消收藏成功", data: result };
});

/**
 * 从 Forge 创建任务
 * POST /api/forge/:id/task
 */
router.post("/:id/task", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const id = parseInt(ctx.params.id, 10);

  if (isNaN(id)) {
    ctx.body = { code: 400, message: "无效的 Forge ID", data: null };
    return;
  }

  const body = ctx.request.body as { message?: string };

  if (!body.message || !body.message.trim()) {
    ctx.body = { code: 400, message: "消息内容不能为空", data: null };
    return;
  }

  const result = await ForgeService.createTaskFromForge(id, body.message.trim(), user.id);
  ctx.body = { code: 200, message: "任务创建成功", data: result };
});

/**
 * 生成 Forge 配置（SSE 流式响应）
 * POST /api/forge/generate-config
 * 根据用户意图和 MCP 工具并行生成名称、描述、系统提示词
 */
router.post("/generate-config", tokenAuth(), async (ctx) => {
  const body = ctx.request.body as {
    userIntent?: string;
    mcpIds?: number[];
    sessionId?: string;
  };

  // 参数验证
  if (!body.userIntent || !body.userIntent.trim()) {
    ctx.body = { code: 400, message: "用户意图不能为空", data: null };
    return;
  }

  if (!body.mcpIds || body.mcpIds.length === 0) {
    ctx.body = { code: 400, message: "MCP ID 列表不能为空", data: null };
    return;
  }

  if (!body.sessionId) {
    ctx.body = { code: 400, message: "sessionId 不能为空", data: null };
    return;
  }

  // 获取原生响应对象，绕过 Koa 的响应缓冲
  const res = ctx.res;

  // 设置 SSE 响应头
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // 写入 SSE 事件
  const writeEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const gateway = await loadGateway();

    // 创建 AbortController 用于取消操作
    const controller = gateway.intentAbortManager.create(body.sessionId);

    // 获取 MCP 工具列表
    const mcpTools: Array<{
      mcpId: number;
      name: string;
      tools: Array<{ name: string; description: string }>;
    }> = [];

    for (const mcpId of body.mcpIds) {
      try {
        const mcp = await McpDAO.findById(mcpId);
        if (!mcp) continue;

        const tools = await mcpManager.getTools(mcpId);
        mcpTools.push({
          mcpId,
          name: mcp.name,
          tools: tools.map((t: MCPTool) => ({
            name: t.name,
            description: t.description || "",
          })),
        });
      } catch (error) {
        console.error(`获取 MCP ${mcpId} 工具列表失败:`, (error as Error).message);
      }
    }

    if (mcpTools.length === 0) {
      writeEvent("error", { message: "无法获取 MCP 工具列表" });
      res.end();
      ctx.respond = false;
      return;
    }

    // 转换为 Gateway 需要的格式
    const gatewayMcpTools = mcpTools.map((mt) => ({
      id: mt.mcpId,
      name: mt.name,
      tools: mt.tools,
    }));

    // 调用 Gateway 生成配置
    const generator = gateway.generateForgeConfig({
      userIntent: body.userIntent.trim(),
      mcpTools: gatewayMcpTools,
      signal: controller.signal,
    });

    // 流式返回配置生成事件
    for await (const event of generator) {
      writeEvent(event.type, event);
    }

    // 清理 AbortController
    gateway.intentAbortManager.cleanup(body.sessionId);
  } catch (error) {
    const errMsg = (error as Error).message;
    if (errMsg === "操作已取消") {
      writeEvent("cancelled", { message: "操作已取消" });
    } else {
      writeEvent("error", { message: errMsg });
    }
  } finally {
    res.end();
  }

  // 告诉 Koa 不要再处理响应
  ctx.respond = false;
});

/**
 * 生成 Forge 摘要
 * POST /api/forge/generate-summary
 * 根据 Forge 关联的 MCP 工具生成能力摘要
 */
router.post("/generate-summary", tokenAuth(), async (ctx) => {
  const body = ctx.request.body as {
    forgeId?: number;
  };

  // 参数验证
  if (!body.forgeId) {
    ctx.body = { code: 400, message: "Forge ID 不能为空", data: null };
    return;
  }

  try {
    const gateway = await loadGateway();

    // 获取 Forge 关联的 MCP 工具
    const forge = await ForgeService.getForgeById(body.forgeId);
    if (!forge.mcpTools || forge.mcpTools.length === 0) {
      ctx.body = { code: 400, message: "Forge 没有关联的 MCP 工具", data: null };
      return;
    }

    // 将 MCP 工具转换为 Gateway 需要的格式
    const tools = forge.mcpTools.flatMap((mt) =>
      mt.tools.map((t) => ({
        name: t.name,
        description: t.description || "",
      }))
    );

    // 调用 Gateway 生成摘要
    const summary = await gateway.generateForgeSummary({ mcpTools: tools });

    // 更新数据库
    const ForgeDAO = (await import("../dao/forgeDAO.js")).default;
    await ForgeDAO.updateSummary(body.forgeId, summary);

    ctx.body = { code: 200, message: "摘要生成成功", data: { summary } };
  } catch (error) {
    ctx.body = { code: 500, message: (error as Error).message, data: null };
  }
});

/**
 * 获取所有 Forge 摘要列表（用于意图分析）
 * GET /api/forge/summaries
 */
router.get("/summaries", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const result = await ForgeService.getAllForgeSummaries(user.id);
  ctx.body = { code: 200, message: "ok", data: result };
});

export default router;
