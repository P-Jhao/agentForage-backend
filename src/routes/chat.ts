/**
 * 对话相关路由
 */
import Router from "@koa/router";
import { PassThrough } from "stream";
import { tokenAuth } from "../middleware/index.js";
import ChatService from "../service/chatService.js";
import LLMService from "../service/llmService.js";

interface SendMessageBody {
  agentId: number;
  message: string;
  conversationId?: number;
}

interface StreamBody {
  agentId: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

const router = new Router();

// SSE 流式对话
router.post("/stream", tokenAuth(), async (ctx) => {
  const { agentId, messages } = ctx.request.body as StreamBody;

  // 设置 SSE 响应头
  ctx.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const stream = new PassThrough();
  ctx.body = stream;
  ctx.status = 200;

  try {
    // 流式输出
    for await (const chunk of LLMService.stream({ agentId, messages })) {
      const data = JSON.stringify({ type: "content", content: chunk.content });
      stream.write(`data: ${data}\n\n`);
    }

    // 发送结束标记
    stream.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  } catch (error) {
    const errMsg = (error as Error).message;
    stream.write(`data: ${JSON.stringify({ type: "error", error: errMsg })}\n\n`);
  } finally {
    stream.end();
  }
});

// 发送消息（调用 Agent）
router.post("/send", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { agentId, message, conversationId } = ctx.request.body as SendMessageBody;
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
  const result = await ChatService.getHistory(Number(conversationId));
  ctx.body = { code: 200, message: "ok", data: result };
});

// 获取用户会话列表
router.get("/conversations", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const result = await ChatService.getConversations(userId);
  ctx.body = { code: 200, message: "ok", data: result };
});

export default router;
