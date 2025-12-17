/**
 * Forge 相关路由
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import ForgeService from "../service/forgeService.js";
import type { JwtPayload } from "../middleware/tokenAuth.js";

const router = new Router();

// Forge 筛选类型
type ForgeFilter = "all" | "my" | "builtin";

/**
 * 获取 Forge 列表
 * GET /api/forge/list?filter=all|my|builtin
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
    name?: string;
    displayName?: string;
    description?: string;
    systemPrompt?: string;
    model?: "qwen" | "deepseek";
    avatar?: string;
    isPublic?: boolean;
  };

  // 参数验证
  if (!body.name || !body.displayName) {
    ctx.body = { code: 400, message: "名称和显示名称不能为空", data: null };
    return;
  }

  // 验证 name 格式（只允许小写字母、数字、连字符）
  if (!/^[a-z0-9-]+$/.test(body.name)) {
    ctx.body = { code: 400, message: "名称只能包含小写字母、数字和连字符", data: null };
    return;
  }

  const result = await ForgeService.createForge(
    {
      name: body.name,
      displayName: body.displayName,
      description: body.description,
      systemPrompt: body.systemPrompt,
      model: body.model,
      avatar: body.avatar,
      isPublic: body.isPublic,
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
    name?: string;
    displayName?: string;
    description?: string;
    systemPrompt?: string;
    model?: "qwen" | "deepseek";
    avatar?: string;
    isPublic?: boolean;
  };

  // 如果修改了 name，验证格式
  if (body.name && !/^[a-z0-9-]+$/.test(body.name)) {
    ctx.body = { code: 400, message: "名称只能包含小写字母、数字和连字符", data: null };
    return;
  }

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

export default router;
