/**
 * 对话相关路由
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import ChatService from "../service/chatService.js";

const router = new Router();

// 发送消息（调用 Agent）
router.post("/send", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id;
  const { agentId, message, conversationId } = ctx.request.body;
  const result = await ChatService.sendMessage({
    userId,
    agentId,
    message,
    conversationId,
  });
  ctx.body = { code: 200, message: "ok", data: result };
});

// 获取会话历史
router.get("/history/:conversationId", tokenAuth(), async (ctx) => {
  const { conversationId } = ctx.params;
  const result = await ChatService.getHistory(conversationId);
  ctx.body = { code: 200, message: "ok", data: result };
});

// 获取用户会话列表
router.get("/conversations", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id;
  const result = await ChatService.getConversations(userId);
  ctx.body = { code: 200, message: "ok", data: result };
});

export default router;
