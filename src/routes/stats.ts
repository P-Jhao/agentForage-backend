/**
 * 公开统计路由
 * 提供首页展示的统计数据（无需管理员权限）
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import { Conversation, Agent, Mcp } from "../dao/models/index.js";
import { Op } from "sequelize";

const router = new Router();

// 首页统计数据响应
interface HomeStatsResponse {
  taskCount: number; // 已处理任务数
  forgeCount: number; // 活跃 Forge 数
  mcpToolCount: number; // MCP 工具数
}

/**
 * 获取首页统计数据
 * GET /api/stats/home
 */
router.get("/home", tokenAuth(), async (ctx) => {
  // 并行查询三个统计数据
  // 历史任务基数（数据库迁移前的统计）
  const TASK_COUNT_BASE = 263;

  const [taskCount, forgeCount, mcpToolCount] = await Promise.all([
    // 已处理任务：统计所有非 deleted 状态的任务 + 历史基数
    Conversation.count({
      where: {
        status: {
          [Op.ne]: "deleted",
        },
      },
    }).then((count) => count + TASK_COUNT_BASE),
    // 活跃 Forge：统计 isActive = true 的 Agent
    Agent.count({
      where: {
        isActive: true,
      },
    }),
    // MCP 工具：统计非 closed 状态的 MCP
    Mcp.count({
      where: {
        status: {
          [Op.ne]: "closed",
        },
      },
    }),
  ]);

  const data: HomeStatsResponse = {
    taskCount,
    forgeCount,
    mcpToolCount,
  };

  ctx.body = { code: 200, message: "ok", data };
});

export default router;
