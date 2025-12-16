/**
 * 对话相关路由
 */
import Router from "@koa/router";
import { PassThrough } from "stream";
import { tokenAuth } from "../middleware/index.js";
import ChatService from "../service/chatService.js";
import LLMService from "../service/llmService.js";
import { createChunk, type StreamChunk } from "../types/index.js";

interface SendMessageBody {
  agentId: number;
  message: string;
  conversationId?: number;
}

interface StreamBody {
  agentId?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: "qwen" | "deepseek";
}

const router = new Router();

/**
 * 写入流式消息（NDJSON 格式）
 */
function writeChunk(stream: PassThrough, chunk: StreamChunk): void {
  stream.write(JSON.stringify(chunk) + "\n");
}

// 流式对话（NDJSON 格式）
router.post("/stream", tokenAuth(), async (ctx) => {
  const { agentId, messages, model } = ctx.request.body as StreamBody;

  // 设置 NDJSON 响应头
  ctx.set({
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const stream = new PassThrough();
  ctx.body = stream;
  ctx.status = 200;

  try {
    // 发送开始状态
    writeChunk(stream, createChunk("status", { status: "running" }));
    writeChunk(stream, createChunk("chatStream", { event: "start" }));

    if (agentId) {
      // 有 agentId，调用对应 Agent
      for await (const chunk of LLMService.stream({ agentId, messages })) {
        writeChunk(stream, createChunk("chatStream", { event: "data", content: chunk.content }));
      }
    } else {
      // 无 agentId，使用简单对话（直接调用 LLM）
      const response = await LLMService.simpleChat(messages, model);
      writeChunk(stream, createChunk("chatStream", { event: "data", content: response }));
    }

    // 发送结束标记
    writeChunk(stream, createChunk("chatStream", { event: "end" }));
    writeChunk(stream, createChunk("status", { status: "success" }));
    writeChunk(stream, createChunk("done"));
  } catch (error) {
    const errMsg = (error as Error).message;
    writeChunk(stream, createChunk("error", { message: errMsg }));
    writeChunk(stream, createChunk("status", { status: "failed", message: errMsg }));
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
