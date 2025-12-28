/**
 * 管理员路由
 * 仅允许 operator 角色访问
 */
import Router from "@koa/router";
import { Op } from "sequelize";
import { tokenAuth, operatorAuth } from "../middleware/index.js";
import { Conversation, User, Message, Agent, Mcp } from "../dao/models/index.js";
import TaskDAO from "../dao/taskDAO.js";
import FeedbackDAO from "../dao/feedbackDAO.js";
import ForgeDAO from "../dao/forgeDAO.js";

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
    pageSize = "10",
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

  // 查询任务列表（包含创建者信息和关联的 Forge）
  const { count, rows: tasks } = await Conversation.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "username", "nickname"],
        required: true,
      },
      {
        model: Agent,
        as: "agent",
        attributes: ["id", "displayName", "avatar"],
        required: false, // 左连接，允许 agentId 为空
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
  // 定义关联数据类型
  type TaskWithRelations = (typeof tasks)[0] & {
    user: { id: number; username: string; nickname: string };
    agent: { id: number; displayName: string; avatar: string | null } | null;
  };

  const taskList = tasks.map((task) => {
    const t = task as unknown as TaskWithRelations;
    return {
      id: task.id,
      uuid: task.uuid,
      title: task.title,
      status: task.status,
      creator: {
        id: t.user.id,
        username: t.user.username,
        nickname: t.user.nickname,
      },
      // 关联的 Forge 信息
      agent: t.agent
        ? {
            id: t.agent.id,
            displayName: t.agent.displayName,
            avatar: t.agent.avatar,
          }
        : null,
      totalTokens: tokenMap.get(task.id) || 0,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  });

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

// 反馈列表请求参数
interface AdminFeedbackListQuery {
  page?: string;
  pageSize?: string;
  taskKeyword?: string;
  userKeyword?: string;
  taskStartTime?: string;
  taskEndTime?: string;
  feedbackType?: "all" | "like" | "dislike" | "cancel";
  feedbackStartTime?: string;
  feedbackEndTime?: string;
}

/**
 * 获取反馈列表
 * GET /api/admin/feedback/list
 */
router.get("/feedback/list", async (ctx) => {
  const {
    page = "1",
    pageSize = "10",
    taskKeyword,
    userKeyword,
    taskStartTime,
    taskEndTime,
    feedbackType,
    feedbackStartTime,
    feedbackEndTime,
  } = ctx.query as AdminFeedbackListQuery;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 10));

  // 调用 DAO 查询
  const { feedbacks, total } = await FeedbackDAO.findAllWithFilters({
    page: pageNum,
    pageSize: pageSizeNum,
    taskKeyword,
    userKeyword,
    taskStartTime: taskStartTime ? new Date(taskStartTime) : undefined,
    taskEndTime: taskEndTime ? new Date(taskEndTime) : undefined,
    feedbackType,
    feedbackStartTime: feedbackStartTime ? new Date(feedbackStartTime) : undefined,
    feedbackEndTime: feedbackEndTime ? new Date(feedbackEndTime) : undefined,
  });

  // 格式化响应数据
  const feedbackList = feedbacks.map((feedback) => ({
    id: feedback.id,
    task: {
      uuid: feedback.task.uuid,
      title: feedback.task.title,
      createdAt: feedback.task.createdAt.toISOString(),
      updatedAt: feedback.task.updatedAt.toISOString(),
    },
    user: {
      id: feedback.user.id,
      username: feedback.user.username,
      nickname: feedback.user.nickname,
    },
    type: feedback.type,
    tags: feedback.tags,
    content: feedback.content,
    createdAt: feedback.createdAt.toISOString(),
  }));

  ctx.body = {
    code: 200,
    message: "ok",
    data: {
      feedbacks: feedbackList,
      pagination: {
        total,
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

// Forge 列表请求参数
interface AdminForgeListQuery {
  page?: string;
  pageSize?: string;
  keyword?: string;
  status?: "all" | "active" | "deleted";
  permission?: "all" | "public" | "private";
}

/**
 * 获取所有 Forge 列表（管理员）
 * GET /api/admin/forge/list
 */
router.get("/forge/list", async (ctx) => {
  const {
    page = "1",
    pageSize = "10",
    keyword,
    status = "all",
    permission = "all",
  } = ctx.query as AdminForgeListQuery;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 10));
  const offset = (pageNum - 1) * pageSizeNum;

  // 构建查询条件
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  // 状态筛选
  if (status === "active") {
    where.isActive = true;
  } else if (status === "deleted") {
    where.isActive = false;
  }
  // status === "all" 时不添加 isActive 条件，显示所有

  // 权限筛选
  if (permission === "public") {
    where.isPublic = true;
  } else if (permission === "private") {
    where.isPublic = false;
  }

  // 关键词搜索（Forge 名称或创建者名称）
  if (keyword) {
    where[Op.or] = [
      { displayName: { [Op.like]: `%${keyword}%` } },
      { "$creator.username$": { [Op.like]: `%${keyword}%` } },
      { "$creator.nickname$": { [Op.like]: `%${keyword}%` } },
    ];
  }

  // 查询 Forge 列表（包含创建者信息和关联的 MCP）
  const { count, rows: forges } = await Agent.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: "creator",
        attributes: ["id", "username", "nickname"],
        required: true,
      },
      {
        model: Mcp,
        as: "mcps",
        attributes: ["id", "name"],
        through: { attributes: [] }, // 不返回中间表字段
        required: false,
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: pageSizeNum,
    offset,
    subQuery: false,
  });

  // 定义关联数据类型
  type ForgeWithRelations = (typeof forges)[0] & {
    creator: { id: number; username: string; nickname: string | null };
    mcps: Array<{ id: number; name: string }>;
  };

  // 构建响应数据
  const forgeList = forges.map((forge) => {
    const f = forge as unknown as ForgeWithRelations;
    return {
      id: forge.id,
      displayName: forge.displayName,
      description: forge.description,
      avatar: forge.avatar,
      isPublic: forge.isPublic,
      isActive: forge.isActive,
      usageCount: forge.usageCount,
      creator: {
        id: f.creator.id,
        username: f.creator.username,
        nickname: f.creator.nickname,
      },
      mcps: f.mcps.map((mcp) => ({
        id: mcp.id,
        name: mcp.name,
      })),
      createdAt: forge.createdAt.toISOString(),
    };
  });

  ctx.body = {
    code: 200,
    message: "ok",
    data: {
      forges: forgeList,
      pagination: {
        total: count,
        page: pageNum,
        pageSize: pageSizeNum,
      },
    },
  };
});

/**
 * 删除 Forge（软删除）
 * DELETE /api/admin/forge/:id
 */
router.delete("/forge/:id", async (ctx) => {
  const { id } = ctx.params;
  const forgeId = parseInt(id, 10);

  if (isNaN(forgeId)) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "无效的 Forge ID" };
    return;
  }

  // 检查 Forge 是否存在
  const forge = await Agent.findByPk(forgeId);
  if (!forge) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "Forge 不存在" };
    return;
  }

  // 软删除
  await ForgeDAO.delete(forgeId);

  ctx.body = { code: 200, message: "ok" };
});

export default router;
