/**
 * MCP 相关路由
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import { McpDAO } from "../dao/index.js";
import type { McpSource } from "../dao/models/Mcp.js";

const router = new Router();

// 获取 MCP 广场列表（官方 + 社区）
router.get("/plaza", async (ctx) => {
  const { keyword, source } = ctx.query as { keyword?: string; source?: McpSource };
  const list = await McpDAO.findPlazaList({ keyword, source });
  ctx.body = { code: 200, message: "ok", data: list };
});

// 获取我的 MCP 列表（需要登录）
router.get("/my", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const list = await McpDAO.findByUserId(userId);
  ctx.body = { code: 200, message: "ok", data: list };
});

// 获取 MCP 详情
router.get("/:id", async (ctx) => {
  const id = Number(ctx.params.id);
  const mcp = await McpDAO.findById(id);
  if (!mcp) {
    ctx.body = { code: 404, message: "MCP 不存在", data: null };
    return;
  }
  ctx.body = { code: 200, message: "ok", data: mcp };
});

export default router;
