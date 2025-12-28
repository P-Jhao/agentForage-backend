/**
 * 分享相关路由
 * 处理分享链接的生成和验证
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import ShareService from "../service/shareService.js";
import TaskService from "../service/taskService.js";
import MessageDAO from "../dao/messageDAO.js";
import UserDAO from "../dao/userDAO.js";

const router = new Router();

// 生成分享签名请求体
interface GenerateShareBody {
  resourceId: string; // 任务 UUID
  mode: "detail" | "replay"; // 分享模式
  expireDays: number; // 有效天数（1-7）
}

/**
 * 生成分享签名
 * POST /api/share/generate
 */
router.post("/generate", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { resourceId, mode, expireDays } = ctx.request.body as GenerateShareBody;

  // 参数验证
  if (!resourceId || typeof resourceId !== "string") {
    ctx.status = 400;
    ctx.body = { code: 400, message: "资源 ID 不能为空" };
    return;
  }

  if (!mode || !["detail", "replay"].includes(mode)) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "分享模式无效，必须是 detail 或 replay" };
    return;
  }

  if (!expireDays || typeof expireDays !== "number" || expireDays < 1 || expireDays > 7) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "有效期必须是 1-7 天" };
    return;
  }

  // 验证任务是否存在且属于当前用户
  const task = await TaskService.getTask(resourceId);
  if (!task) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "任务不存在" };
    return;
  }

  if (task.userId !== userId) {
    ctx.status = 403;
    ctx.body = { code: 403, message: "无权分享该任务" };
    return;
  }

  // 生成签名
  const sign = ShareService.generateSign(resourceId, mode, expireDays);

  ctx.body = {
    code: 200,
    message: "ok",
    data: { sign },
  };
});

/**
 * 通过分享链接获取任务详情（无需登录）
 * GET /api/share/task/:id
 */
router.get("/task/:id", async (ctx) => {
  const { id: uuid } = ctx.params;
  const { shareSign } = ctx.query;

  // 验证签名参数
  if (!shareSign || typeof shareSign !== "string") {
    ctx.status = 401;
    ctx.body = { code: 401, message: "缺少分享签名" };
    return;
  }

  // 验证签名
  const verifyResult = ShareService.verifySign(shareSign, uuid);
  if (!verifyResult.valid) {
    ctx.status = 403;
    ctx.body = { code: 403, message: verifyResult.error || "分享链接无效" };
    return;
  }

  // 获取任务详情
  const task = await TaskService.getTask(uuid);
  if (!task) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "任务不存在" };
    return;
  }

  // 将 Sequelize 模型转换为普通对象，避免循环引用
  const taskData = task.get({ plain: true });

  // 获取任务所有者信息
  const owner = await UserDAO.findById(task.userId);
  const ownerName = owner?.nickname || owner?.username || "未知用户";
  const ownerAvatar = owner?.avatar || null;

  ctx.body = {
    code: 200,
    message: "ok",
    data: {
      ...taskData,
      ownerName, // 任务所有者名称
      ownerAvatar, // 任务所有者头像
      shareMode: verifyResult.payload?.mode, // 返回分享模式
    },
  };
});

/**
 * 通过分享链接获取任务消息（无需登录）
 * GET /api/share/task/:id/messages
 */
router.get("/task/:id/messages", async (ctx) => {
  const { id: uuid } = ctx.params;
  const { shareSign } = ctx.query;

  // 验证签名参数
  if (!shareSign || typeof shareSign !== "string") {
    ctx.status = 401;
    ctx.body = { code: 401, message: "缺少分享签名" };
    return;
  }

  // 验证签名
  const verifyResult = ShareService.verifySign(shareSign, uuid);
  if (!verifyResult.valid) {
    ctx.status = 403;
    ctx.body = { code: 403, message: verifyResult.error || "分享链接无效" };
    return;
  }

  // 获取任务详情（需要 conversationId）
  const task = await TaskService.getTask(uuid);
  if (!task) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "任务不存在" };
    return;
  }

  // 获取消息列表（已经是普通对象数组）
  const messages = await MessageDAO.findFlatByConversationId(task.id);

  ctx.body = {
    code: 200,
    message: "ok",
    data: {
      messages,
      shareMode: verifyResult.payload?.mode,
    },
  };
});

export default router;
