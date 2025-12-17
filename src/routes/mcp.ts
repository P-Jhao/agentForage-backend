/**
 * MCP 相关路由
 * 提供 MCP 管理功能的 API 接口
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import McpService from "../service/mcpService.js";
import type { JwtPayload } from "../middleware/tokenAuth.js";

const router = new Router();

/**
 * 创建 MCP（仅管理员）
 * POST /api/mcp
 */
router.post("/", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const { name, transportType, connectionUrl, description, timeout, headers, remarks, example } =
    ctx.request.body as {
      name: string;
      transportType: "stdio" | "sse" | "streamableHttp";
      connectionUrl: string;
      description?: string;
      timeout?: number;
      headers?: string;
      remarks?: string;
      example?: string;
    };

  // 参数验证
  if (!name || !transportType || !connectionUrl) {
    ctx.body = { code: 400, message: "名称、传输方式、连接地址为必填项", data: null };
    return;
  }

  // 名称长度验证
  if (name.length > 100) {
    ctx.body = { code: 400, message: "名称长度不能超过 100 字符", data: null };
    return;
  }

  // 传输方式验证
  if (!["stdio", "sse", "streamableHttp"].includes(transportType)) {
    ctx.body = { code: 400, message: "传输方式无效", data: null };
    return;
  }

  // 超时时间验证
  if (timeout !== undefined && (typeof timeout !== "number" || timeout <= 0)) {
    ctx.body = { code: 400, message: "超时时间必须为正整数", data: null };
    return;
  }

  // 请求头 JSON 格式验证
  if (headers) {
    try {
      JSON.parse(headers);
    } catch {
      ctx.body = { code: 400, message: "请求头必须为有效的 JSON 格式", data: null };
      return;
    }
  }

  try {
    const mcp = await McpService.createMCP(
      { name, transportType, connectionUrl, description, timeout, headers, remarks, example },
      user
    );
    ctx.body = { code: 200, message: "创建成功", data: mcp };
  } catch (error) {
    const err = error as Error & { status?: number };
    ctx.status = err.status || 500;
    ctx.body = { code: err.status || 500, message: err.message, data: null };
  }
});

/**
 * 获取 MCP 列表
 * GET /api/mcp/list?keyword=xxx
 */
router.get("/list", async (ctx) => {
  const { keyword } = ctx.query as { keyword?: string };
  const list = await McpService.getMCPList(keyword);
  ctx.body = { code: 200, message: "ok", data: list };
});

/**
 * 验证 Forge 公开时的 MCP 合规性
 * POST /api/mcp/validate-forge-publish
 */
router.post("/validate-forge-publish", tokenAuth(), async (ctx) => {
  const { forgeId } = ctx.request.body as { forgeId: number };

  if (!forgeId) {
    ctx.body = { code: 400, message: "forgeId 为必填项", data: null };
    return;
  }

  const result = await McpService.validateForgePublish(forgeId);
  ctx.body = { code: 200, message: "ok", data: result };
});

/**
 * 获取 MCP 详情（含关联 Forge、工具列表）
 * GET /api/mcp/:id/detail
 */
router.get("/:id/detail", tokenAuth(), async (ctx) => {
  const id = Number(ctx.params.id);
  const user = ctx.state.user as JwtPayload;

  if (isNaN(id)) {
    ctx.body = { code: 400, message: "无效的 MCP ID", data: null };
    return;
  }

  try {
    const detail = await McpService.getMCPDetail(id, user.id);
    ctx.body = { code: 200, message: "ok", data: detail };
  } catch (error) {
    const err = error as Error & { status?: number };
    ctx.status = err.status || 500;
    ctx.body = { code: err.status || 500, message: err.message, data: null };
  }
});

/**
 * 关闭 MCP（仅管理员）
 * POST /api/mcp/:id/close
 */
router.post("/:id/close", tokenAuth(), async (ctx) => {
  const id = Number(ctx.params.id);
  const user = ctx.state.user as JwtPayload;

  if (isNaN(id)) {
    ctx.body = { code: 400, message: "无效的 MCP ID", data: null };
    return;
  }

  try {
    const result = await McpService.closeMCP(id, user);
    ctx.body = { code: 200, message: "关闭成功", data: result };
  } catch (error) {
    const err = error as Error & { status?: number };
    ctx.status = err.status || 500;
    ctx.body = { code: err.status || 500, message: err.message, data: null };
  }
});

/**
 * 重连 MCP（所有用户可用）
 * POST /api/mcp/:id/reconnect
 */
router.post("/:id/reconnect", tokenAuth(), async (ctx) => {
  const id = Number(ctx.params.id);

  if (isNaN(id)) {
    ctx.body = { code: 400, message: "无效的 MCP ID", data: null };
    return;
  }

  try {
    const result = await McpService.reconnectMCP(id);
    ctx.body = { code: 200, message: "重连成功", data: result };
  } catch (error) {
    const err = error as Error & { status?: number };
    ctx.status = err.status || 500;
    ctx.body = { code: err.status || 500, message: err.message, data: null };
  }
});

/**
 * 获取 MCP 详情
 * GET /api/mcp/:id
 */
router.get("/:id", async (ctx) => {
  const id = Number(ctx.params.id);

  if (isNaN(id)) {
    ctx.body = { code: 400, message: "无效的 MCP ID", data: null };
    return;
  }

  try {
    const mcp = await McpService.getMCP(id);
    ctx.body = { code: 200, message: "ok", data: mcp };
  } catch (error) {
    const err = error as Error & { status?: number };
    ctx.status = err.status || 500;
    ctx.body = { code: err.status || 500, message: err.message, data: null };
  }
});

/**
 * 更新 MCP（仅管理员）
 * PUT /api/mcp/:id
 */
router.put("/:id", tokenAuth(), async (ctx) => {
  const id = Number(ctx.params.id);
  const user = ctx.state.user as JwtPayload;
  const { name, transportType, connectionUrl, description, timeout, headers, remarks, example } =
    ctx.request.body as {
      name?: string;
      transportType?: "stdio" | "sse" | "streamableHttp";
      connectionUrl?: string;
      description?: string;
      timeout?: number;
      headers?: string;
      remarks?: string;
      example?: string;
    };

  if (isNaN(id)) {
    ctx.body = { code: 400, message: "无效的 MCP ID", data: null };
    return;
  }

  // 名称长度验证
  if (name && name.length > 100) {
    ctx.body = { code: 400, message: "名称长度不能超过 100 字符", data: null };
    return;
  }

  // 传输方式验证
  if (transportType && !["stdio", "sse", "streamableHttp"].includes(transportType)) {
    ctx.body = { code: 400, message: "传输方式无效", data: null };
    return;
  }

  // 超时时间验证
  if (timeout !== undefined && (typeof timeout !== "number" || timeout <= 0)) {
    ctx.body = { code: 400, message: "超时时间必须为正整数", data: null };
    return;
  }

  // 请求头 JSON 格式验证
  if (headers) {
    try {
      JSON.parse(headers);
    } catch {
      ctx.body = { code: 400, message: "请求头必须为有效的 JSON 格式", data: null };
      return;
    }
  }

  try {
    const mcp = await McpService.updateMCP(
      id,
      { name, transportType, connectionUrl, description, timeout, headers, remarks, example },
      user
    );
    ctx.body = { code: 200, message: "更新成功", data: mcp };
  } catch (error) {
    const err = error as Error & { status?: number };
    ctx.status = err.status || 500;
    ctx.body = { code: err.status || 500, message: err.message, data: null };
  }
});

/**
 * 删除 MCP（仅管理员）
 * DELETE /api/mcp/:id
 */
router.delete("/:id", tokenAuth(), async (ctx) => {
  const id = Number(ctx.params.id);
  const user = ctx.state.user as JwtPayload;

  if (isNaN(id)) {
    ctx.body = { code: 400, message: "无效的 MCP ID", data: null };
    return;
  }

  try {
    const result = await McpService.deleteMCP(id, user);
    ctx.body = { code: 200, message: "删除成功", data: result };
  } catch (error) {
    const err = error as Error & { status?: number };
    ctx.status = err.status || 500;
    ctx.body = { code: err.status || 500, message: err.message, data: null };
  }
});

export default router;
