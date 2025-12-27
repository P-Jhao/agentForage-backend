/**
 * 管理员路由
 * 仅允许 operator 角色访问
 */
import Router from "@koa/router";
import { Op } from "sequelize";
import { tokenAuth, operatorAuth } from "../middleware/index.js";
import { Conversation, User, Message } from "../dao/models/index.js";
import TaskDAO from "../dao/taskDAO.js";

const router = new Router();

// 所有 admin 路由都需要登录 + operator 权限
router.use(tokenAuth());
router.use(operatorAuth());

// 任务列表请求参数
interface AdminTaskListQuery {
  page?: string;
  pageSize?: string;
  keyword?: string;
  startTime?: string;
  endTime?: string;
  sortBy?: "tokens";
  sortOrder?: "asc" | "desc";
}

/**
 * 获取所有任务列表
 * GET /api/admin/task/list
 */
router.get("/task/list", async (ctx) => {
  const {
    page = "1",
    pageSize = "20",
    keyword,
    startTime,
    endTime,
    sortBy,
    sortOrder,
  } = ctx.query as AdminTaskListQuery;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
  const offset = (pageNum - 1) * pageSizeNum;

  // 构建查询条件
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  // 时间范围筛选
  if (startTime || endTime) {
    where.createdAt = {};
    if (startTime) {
      where.createdAt[Op.gte] = new Date(startTime);
    }
    if (endTime) {
      where.createdAt[Op.lte] = new Date(endTime);
    }
  }

  // 关键词搜索（标题或创建者名称）
  if (keyword) {
    where[Op.or] = [
      { title: { [Op.like]: `%${keyword}%` } },
      { "$user.username$": { [Op.like]: `%${keyword}%` } },
      { "$user.nickname$": { [Op.like]: `%${keyword}%` } },
    ];
  }

  // 查询任务列表（包含创建者信息）
  const { count, rows: tasks } = await Conversation.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "username", "nickname"],
        required: true,
      },
    ],
    order: [["updatedAt", "DESC"]],
    limit: pageSizeNum,
    offset,
    subQuery: false, // 关联表字段搜索需要禁用子查询
  });

  // 获取每个任务的累积 token 消耗
  const taskIds = tasks.map((t) => t.id);
  const tokenMap = new Map<number, number>();

  if (taskIds.length > 0) {
    // 查询每个任务最后一条 turn_end 消息的累积 token
    const turnEndMessages = await Message.findAll({
      where: {
        conversationId: { [Op.in]: taskIds },
        type: "turn_end",
      },
      attributes: ["conversationId", "content"],
      order: [["createdAt", "DESC"]],
    });

    // 按任务分组，取最新的 turn_end 消息
    const latestTurnEnd = new Map<number, string>();
    for (const msg of turnEndMessages) {
      if (!latestTurnEnd.has(msg.conversationId)) {
        latestTurnEnd.set(msg.conversationId, msg.content);
      }
    }

    // 解析 token 数量
    for (const [convId, content] of latestTurnEnd) {
      try {
        const data = JSON.parse(content);
        // accumulatedTokens 是一个对象 { promptTokens, completionTokens, totalTokens }
        const tokens = data.accumulatedTokens;
        tokenMap.set(convId, tokens?.totalTokens || 0);
      } catch {
        tokenMap.set(convId, 0);
      }
    }
  }

  // 构建响应数据
  const taskList = tasks.map((task) => ({
    id: task.id,
    uuid: task.uuid,
    title: task.title,
    status: task.status,
    creator: {
      id: (task as unknown as { user: { id: number; username: string; nickname: string } }).user.id,
      username: (task as unknown as { user: { id: number; username: string; nickname: string } })
        .user.username,
      nickname: (task as unknown as { user: { id: number; username: string; nickname: string } })
        .user.nickname,
    },
    totalTokens: tokenMap.get(task.id) || 0,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  }));

  // Token 排序（在内存中排序，因为 token 是从 JSON 解析的）
  if (sortBy === "tokens") {
    taskList.sort((a, b) => {
      if (sortOrder === "asc") {
        return a.totalTokens - b.totalTokens;
      }
      return b.totalTokens - a.totalTokens;
    });
  }

  ctx.body = {
    code: 200,
    message: "ok",
    data: {
      tasks: taskList,
      pagination: {
        total: count,
        page: pageNum,
        pageSize: pageSizeNum,
      },
    },
  };
});

/**
 * 删除任务
 * DELETE /api/admin/task/:id
 */
router.delete("/task/:id", async (ctx) => {
  const { id: uuid } = ctx.params;

  // 检查任务是否存在
  const task = await TaskDAO.findByUuid(uuid);
  if (!task) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "任务不存在" };
    return;
  }

  // 删除任务
  await TaskDAO.delete(uuid);

  ctx.body = { code: 200, message: "ok" };
});

export default router;
