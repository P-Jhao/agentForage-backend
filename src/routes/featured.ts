/**
 * 推荐示例相关路由
 * 处理推荐示例的 CRUD 操作
 */
import Router from "@koa/router";
import { tokenAuth, adminAuth } from "../middleware/index.js";
import FeaturedTaskService from "../service/featuredTaskService.js";

const router = new Router();

// 创建/更新推荐示例请求体
interface SetFeaturedBody {
  taskUuid: string;
  coverImage?: string;
  title?: string;
  description?: string;
  clonePrompt?: string;
  enableThinking?: boolean;
  enhanceMode?: string;
  smartRoutingEnabled?: boolean;
  sortOrder?: number;
}

/**
 * 获取推荐示例列表（公开接口）
 * GET /api/featured/list
 */
router.get("/list", tokenAuth(), async (ctx) => {
  const list = await FeaturedTaskService.getList();
  ctx.body = { code: 200, message: "ok", data: list };
});

/**
 * 检查任务是否为推荐示例
 * GET /api/featured/check/:taskUuid
 */
router.get("/check/:taskUuid", tokenAuth(), async (ctx) => {
  const { taskUuid } = ctx.params;
  const featured = await FeaturedTaskService.getByTaskUuid(taskUuid);
  ctx.body = {
    code: 200,
    message: "ok",
    data: { isFeatured: !!featured, featured },
  };
});

/**
 * 设置推荐示例（管理员）
 * POST /api/featured
 */
router.post("/", tokenAuth(), adminAuth(), async (ctx) => {
  const {
    taskUuid,
    coverImage,
    title,
    description,
    clonePrompt,
    enableThinking,
    enhanceMode,
    smartRoutingEnabled,
    sortOrder,
  } = ctx.request.body as SetFeaturedBody;

  if (!taskUuid) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "任务 UUID 不能为空" };
    return;
  }

  const featured = await FeaturedTaskService.setFeatured({
    taskUuid,
    coverImage,
    title,
    description,
    clonePrompt,
    enableThinking,
    enhanceMode,
    smartRoutingEnabled,
    sortOrder,
  });

  ctx.body = { code: 200, message: "ok", data: featured };
});

/**
 * 取消推荐示例（管理员）
 * DELETE /api/featured/:taskUuid
 */
router.delete("/:taskUuid", tokenAuth(), adminAuth(), async (ctx) => {
  const { taskUuid } = ctx.params;

  const success = await FeaturedTaskService.removeFeatured(taskUuid);

  if (!success) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "该任务不是推荐示例" };
    return;
  }

  ctx.body = { code: 200, message: "ok" };
});

export default router;
