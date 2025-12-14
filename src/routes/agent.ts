/**
 * Agent 相关路由
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import AgentService from "../service/agentService.js";

const router = new Router();

// 获取所有可用 Agent 列表
router.get("/list", tokenAuth(), async (ctx) => {
  const result = await AgentService.getAgentList();
  ctx.body = { code: 200, message: "ok", data: result };
});

// 获取单个 Agent 配置
router.get("/:agentId", tokenAuth(), async (ctx) => {
  const { agentId } = ctx.params;
  const result = await AgentService.getAgentById(agentId);
  ctx.body = { code: 200, message: "ok", data: result };
});

export default router;
