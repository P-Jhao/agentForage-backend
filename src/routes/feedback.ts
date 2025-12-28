/**
 * 反馈相关路由
 * 处理用户对 AI 回复的点赞/踩反馈
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import TaskService from "../service/taskService.js";
import FeedbackDAO from "../dao/feedbackDAO.js";
import FeedbackRateLimiter from "../service/feedbackRateLimiter.js";
import type { FeedbackType } from "../dao/models/Feedback.js";

const router = new Router();

// 提交反馈请求体
interface SubmitFeedbackBody {
  turnEndMessageId: number;
  type: "like" | "dislike";
  tags?: string[];
  content?: string;
}

// 取消反馈请求体
interface CancelFeedbackBody {
  turnEndMessageId: number;
}

// 批量获取反馈状态请求体
interface BatchFeedbackBody {
  turnEndMessageIds: number[];
}

/**
 * 提交反馈
 * POST /api/feedback/:taskId
 */
router.post("/:taskId", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { taskId: uuid } = ctx.params;
  const { turnEndMessageId, type, tags, content } = ctx.request.body as SubmitFeedbackBody;

  // 参数验证
  if (!turnEndMessageId || typeof turnEndMessageId !== "number") {
    ctx.status = 400;
    ctx.body = { code: 400, message: "轮次消息 ID 不能为空" };
    return;
  }

  if (!type || !["like", "dislike"].includes(type)) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "反馈类型无效" };
    return;
  }

  // 获取任务
  const task = await TaskService.getTask(uuid);
  if (!task) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "任务不存在" };
    return;
  }

  // 验证任务归属（只能对自己的任务提交反馈）
  if (task.userId !== userId) {
    ctx.status = 403;
    ctx.body = { code: 403, message: "无权访问该任务" };
    return;
  }

  // 验证 turnEndMessageId 属于该任务
  const isValid = await FeedbackDAO.validateTurnEndMessage(turnEndMessageId, task.id);
  if (!isValid) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "无效的轮次消息 ID" };
    return;
  }

  // 节流控制
  if (!FeedbackRateLimiter.checkLimit(userId)) {
    ctx.status = 429;
    ctx.body = { code: 429, message: "反馈过于频繁，请稍后再试" };
    return;
  }

  // 记录请求（用于节流）
  FeedbackRateLimiter.recordRequest(userId);

  // 创建反馈记录
  const feedback = await FeedbackDAO.create({
    taskId: task.id,
    turnEndMessageId,
    userId,
    type,
    tags,
    content,
  });

  ctx.body = {
    code: 200,
    message: "ok",
    data: {
      id: feedback.id,
      taskId: feedback.taskId,
      turnEndMessageId: feedback.turnEndMessageId,
      userId: feedback.userId,
      type: feedback.type,
      tags: feedback.getParsedTags(),
      content: feedback.content,
      createdAt: feedback.createdAt.toISOString(),
    },
  };
});

/**
 * 取消反馈
 * POST /api/feedback/:taskId/cancel
 */
router.post("/:taskId/cancel", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { taskId: uuid } = ctx.params;
  const { turnEndMessageId } = ctx.request.body as CancelFeedbackBody;

  // 参数验证
  if (!turnEndMessageId || typeof turnEndMessageId !== "number") {
    ctx.status = 400;
    ctx.body = { code: 400, message: "轮次消息 ID 不能为空" };
    return;
  }

  // 获取任务
  const task = await TaskService.getTask(uuid);
  if (!task) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "任务不存在" };
    return;
  }

  // 验证任务归属
  if (task.userId !== userId) {
    ctx.status = 403;
    ctx.body = { code: 403, message: "无权访问该任务" };
    return;
  }

  // 验证 turnEndMessageId 属于该任务
  const isValid = await FeedbackDAO.validateTurnEndMessage(turnEndMessageId, task.id);
  if (!isValid) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "无效的轮次消息 ID" };
    return;
  }

  // 节流控制
  if (!FeedbackRateLimiter.checkLimit(userId)) {
    ctx.status = 429;
    ctx.body = { code: 429, message: "反馈过于频繁，请稍后再试" };
    return;
  }

  // 记录请求（用于节流）
  FeedbackRateLimiter.recordRequest(userId);

  // 创建取消反馈记录
  const feedback = await FeedbackDAO.create({
    taskId: task.id,
    turnEndMessageId,
    userId,
    type: "cancel" as FeedbackType,
  });

  ctx.body = {
    code: 200,
    message: "ok",
    data: {
      id: feedback.id,
      type: feedback.type,
      createdAt: feedback.createdAt.toISOString(),
    },
  };
});

/**
 * 批量获取反馈状态
 * POST /api/feedback/:taskId/batch
 */
router.post("/:taskId/batch", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { taskId: uuid } = ctx.params;
  const { turnEndMessageIds } = ctx.request.body as BatchFeedbackBody;

  // 参数验证
  if (!turnEndMessageIds || !Array.isArray(turnEndMessageIds)) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "轮次消息 ID 列表不能为空" };
    return;
  }

  // 获取任务
  const task = await TaskService.getTask(uuid);
  if (!task) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "任务不存在" };
    return;
  }

  // 验证任务归属
  if (task.userId !== userId) {
    ctx.status = 403;
    ctx.body = { code: 403, message: "无权访问该任务" };
    return;
  }

  // 批量获取反馈状态
  const feedbackMap = await FeedbackDAO.findLatestByTurnEndMessageIds(turnEndMessageIds, userId);

  ctx.body = {
    code: 200,
    message: "ok",
    data: feedbackMap,
  };
});

export default router;
