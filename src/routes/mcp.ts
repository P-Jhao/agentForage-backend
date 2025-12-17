/**
 * MCP 相关路由
 * 提供 MCP 列表查询和详情查看功能
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import { McpDAO } from "../dao/index.js";

const router = new Router();

/**
 * 获取 MCP 列表
 * GET /api/mcp/list?keyword=xxx
 * 权限：所有用户
 */
router.get("/list", async (ctx) => {
  const { keyword } = ctx.query as { keyword?: string };
  const list = await McpDAO.findAll(keyword);
  ctx.body = { code: 200, message: "ok", data: list };
});

/**
 * 获取 MCP 详情
 * GET /api/mcp/:id
 * 权限：所有用户
 */
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
