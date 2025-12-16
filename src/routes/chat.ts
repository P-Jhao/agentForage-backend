/**
 * 对话相关路由
 */
import Router from "@koa/router";
import { PassThrough } from "stream";
import { tokenAuth } from "../middleware/index.js";
import ChatService from "../service/chatService.js";
import { createChunk, type StreamChunk } from "../types/index.js";

// 动态导入 gateway
const loadGateway = async () => {
  return await import("agentforge-gateway");
};

interface SendMessageBody {
  agentId: number;
  message: string;
  conversationId?: number;
}

interface StreamBody {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  // 模型选择（可选，默认千问）
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
// 通过 LangChain 调用 LLM
router.post("/stream", tokenAuth(), async (ctx) => {
  const { messages, model } = ctx.request.body as StreamBody;

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
    const { chatService } = await loadGateway();

    // 发送开始状态
    writeChunk(stream, createChunk("status", { status: "running" }));
    writeChunk(stream, createChunk("chatStream", { event: "start" }));

    // 通过 chatService.stream 执行，支持选择模型
    for await (const chunk of chatService.stream({ messages, model })) {
      writeChunk(stream, createChunk("chatStream", { event: "data", content: chunk.content }));
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
