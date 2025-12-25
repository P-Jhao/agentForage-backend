/**
 * 意图分析路由
 * 处理智能路由相关的 API 请求
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import IntentService from "../service/intentService.js";
import type { JwtPayload } from "../middleware/tokenAuth.js";

const router = new Router();

/**
 * 统一意图分析
 * POST /api/intent/analyze
 * 先尝试匹配现有 Forge，如果没有匹配则分析 MCP 工具
 */
router.post("/analyze", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const body = ctx.request.body as {
    userInput?: string;
    sessionId?: string;
  };

  // 参数验证
  if (!body.userInput || !body.userInput.trim()) {
    ctx.body = { code: 400, message: "用户输入不能为空", data: null };
    return;
  }

  if (!body.sessionId) {
    ctx.body = { code: 400, message: "sessionId 不能为空", data: null };
    return;
  }

  try {
    const result = await IntentService.analyzeIntent({
      userInput: body.userInput.trim(),
      userId: user.id,
      sessionId: body.sessionId,
    });

    ctx.body = { code: 200, message: "ok", data: result };
  } catch (error) {
    // 如果是取消操作导致的错误
    if ((error as Error).message === "操作已取消") {
      ctx.body = { code: 499, message: "操作已取消", data: null };
      return;
    }
    throw error;
  }
});

/**
 * 分析 Forge 意图（保留兼容，后续可删除）
 * POST /api/intent/analyze-forge
 */
router.post("/analyze-forge", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const body = ctx.request.body as {
    userInput?: string;
    sessionId?: string;
  };

  // 参数验证
  if (!body.userInput || !body.userInput.trim()) {
    ctx.body = { code: 400, message: "用户输入不能为空", data: null };
    return;
  }

  if (!body.sessionId) {
    ctx.body = { code: 400, message: "sessionId 不能为空", data: null };
    return;
  }

  try {
    const result = await IntentService.analyzeForgeIntent({
      userInput: body.userInput.trim(),
      userId: user.id,
      sessionId: body.sessionId,
    });

    ctx.body = { code: 200, message: "ok", data: result };
  } catch (error) {
    // 如果是取消操作导致的错误
    if ((error as Error).message === "操作已取消") {
      ctx.body = { code: 499, message: "操作已取消", data: null };
      return;
    }
    throw error;
  }
});

/**
 * 分析 MCP 意图
 * POST /api/intent/analyze-mcp
 */
router.post("/analyze-mcp", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const body = ctx.request.body as {
    userInput?: string;
    sessionId?: string;
  };

  // 参数验证
  if (!body.userInput || !body.userInput.trim()) {
    ctx.body = { code: 400, message: "用户输入不能为空", data: null };
    return;
  }

  if (!body.sessionId) {
    ctx.body = { code: 400, message: "sessionId 不能为空", data: null };
    return;
  }

  try {
    const result = await IntentService.analyzeMCPIntent({
      userInput: body.userInput.trim(),
      userId: user.id,
      sessionId: body.sessionId,
    });

    ctx.body = { code: 200, message: "ok", data: result };
  } catch (error) {
    // 如果是取消操作导致的错误
    if ((error as Error).message === "操作已取消") {
      ctx.body = { code: 499, message: "操作已取消", data: null };
      return;
    }
    throw error;
  }
});

/**
 * 取消意图分析操作
 * POST /api/intent/cancel
 */
router.post("/cancel", tokenAuth(), async (ctx) => {
  const body = ctx.request.body as {
    sessionId?: string;
  };

  // 参数验证
  if (!body.sessionId) {
    ctx.body = { code: 400, message: "sessionId 不能为空", data: null };
    return;
  }

  const result = await IntentService.cancelIntent(body.sessionId);

  if (result.success) {
    ctx.body = { code: 200, message: result.message, data: result };
  } else {
    ctx.body = { code: 404, message: result.message, data: result };
  }
});

export default router;
