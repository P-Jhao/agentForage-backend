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
 * 创建 MCP
 * 管理员可创建所有类型，普通用户只能创建 SSE 和 StreamableHTTP 类型
 * POST /api/mcp
 */
router.post("/", tokenAuth(), async (ctx) => {
  const user = ctx.state.user as JwtPayload;
  const {
    name,
    transportType,
    command,
    args,
    env,
    url,
    description,
    timeout,
    headers,
    remarks,
    example,
    isPublic,
  } = ctx.request.body as {
    name: string;
    transportType: "stdio" | "sse" | "streamableHttp";
    command?: string;
    args?: string;
    env?: string;
    url?: string;
    description?: string;
    timeout?: number;
    headers?: string;
    remarks?: string;
    example?: string;
    isPublic?: boolean;
  };

  // 参数验证
  if (!name || !transportType) {
    ctx.body = { code: 400, message: "名称、传输方式为必填项", data: null };
    return;
  }

  // stdio 类型必须有 command
  if (transportType === "stdio" && !command) {
    ctx.body = { code: 400, message: "stdio 类型必须填写启动命令", data: null };
    return;
  }

  // sse/http 类型必须有 url
  if ((transportType === "sse" || transportType === "streamableHttp") && !url) {
    ctx.body = { code: 400, message: "SSE/HTTP 类型必须填写连接地址", data: null };
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

  // args JSON 数组格式验证
  if (args) {
    try {
      const parsed = JSON.parse(args);
      if (!Array.isArray(parsed)) {
        ctx.body = { code: 400, message: "命令参数必须为 JSON 数组格式", data: null };
        return;
      }
    } catch {
      ctx.body = { code: 400, message: "命令参数必须为有效的 JSON 数组格式", data: null };
      return;
    }
  }

  // env JSON 对象格式验证
  if (env) {
    try {
      const parsed = JSON.parse(env);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        ctx.body = { code: 400, message: "环境变量必须为 JSON 对象格式", data: null };
        return;
      }
    } catch {
      ctx.body = { code: 400, message: "环境变量必须为有效的 JSON 对象格式", data: null };
      return;
    }
  }

  // 请求头 JSON 格式验证
  if (headers) {
    try {
      const parsed = JSON.parse(headers);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        ctx.body = { code: 400, message: "请求头必须为 JSON 对象格式", data: null };
        return;
      }
    } catch {
      ctx.body = { code: 400, message: "请求头必须为有效的 JSON 对象格式", data: null };
      return;
    }
  }

  try {
    const mcp = await McpService.createMCP(
      {
        name,
        transportType,
        command,
        args,
        env,
        url,
        description,
        timeout,
        headers,
        remarks,
        example,
        isPublic: isPublic ?? false, // 默认私有
      },
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
 * GET /api/mcp/list?keyword=xxx&filter=all|builtin|mine|other
 * 普通用户只能看到公开的 MCP 或自己创建的私有 MCP
 */
router.get("/list", tokenAuth(), async (ctx) => {
  const { keyword, filter } = ctx.query as { keyword?: string; filter?: string };
  const user = ctx.state.user as JwtPayload;

  // 验证 filter 参数
  const validFilters = ["all", "builtin", "mine", "other"];
  const filterType = validFilters.includes(filter || "") ? filter : "all";

  const list = await McpService.getMCPList(
    { keyword, filter: filterType as "all" | "builtin" | "mine" | "other" },
    user
  );
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

  // 判断是否为管理员（operator 或 root）
  const isAdmin = user.role === "operator" || user.role === "root";

  try {
    const detail = await McpService.getMCPDetail(id, user.id, isAdmin);
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
  const {
    name,
    transportType,
    command,
    args,
    env,
    url,
    description,
    timeout,
    headers,
    remarks,
    example,
    isPublic,
  } = ctx.request.body as {
    name?: string;
    transportType?: "stdio" | "sse" | "streamableHttp";
    command?: string;
    args?: string;
    env?: string;
    url?: string;
    description?: string;
    timeout?: number;
    headers?: string;
    remarks?: string;
    example?: string;
    isPublic?: boolean;
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

  // args JSON 数组格式验证
  if (args) {
    try {
      const parsed = JSON.parse(args);
      if (!Array.isArray(parsed)) {
        ctx.body = { code: 400, message: "命令参数必须为 JSON 数组格式", data: null };
        return;
      }
    } catch {
      ctx.body = { code: 400, message: "命令参数必须为有效的 JSON 数组格式", data: null };
      return;
    }
  }

  // env JSON 对象格式验证
  if (env) {
    try {
      const parsed = JSON.parse(env);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        ctx.body = { code: 400, message: "环境变量必须为 JSON 对象格式", data: null };
        return;
      }
    } catch {
      ctx.body = { code: 400, message: "环境变量必须为有效的 JSON 对象格式", data: null };
      return;
    }
  }

  // 请求头 JSON 格式验证
  if (headers) {
    try {
      const parsed = JSON.parse(headers);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        ctx.body = { code: 400, message: "请求头必须为 JSON 对象格式", data: null };
        return;
      }
    } catch {
      ctx.body = { code: 400, message: "请求头必须为有效的 JSON 对象格式", data: null };
      return;
    }
  }

  try {
    const mcp = await McpService.updateMCP(
      id,
      {
        name,
        transportType,
        command,
        args,
        env,
        url,
        description,
        timeout,
        headers,
        remarks,
        example,
        isPublic,
      },
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
