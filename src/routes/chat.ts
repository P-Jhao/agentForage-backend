/**
 * 对话相关路由
 */
import Router from "@koa/router";
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

// 流式对话（NDJSON 格式）
// 使用原生响应对象绕过 Koa 缓冲，实现真正的流式响应
router.post("/stream", tokenAuth(), async (ctx) => {
  const { messages, model } = ctx.request.body as StreamBody;

  // 获取原生响应对象，绕过 Koa 的响应缓冲
  const res = ctx.res;

  // 设置响应头
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // 写入 NDJSON 格式数据
  const write = (chunk: StreamChunk) => {
    res.write(JSON.stringify(chunk) + "\n");
  };

  try {
    const { chatService } = await loadGateway();

    // 发送开始状态
    write(createChunk("status", { status: "running" }));
    write(createChunk("chatStream", { event: "start" }));

    // 通过 chatService.stream 执行，支持选择模型
    for await (const chunk of chatService.stream({ messages, model })) {
      write(createChunk("chatStream", { event: "data", content: chunk.content }));
    }

    // 发送结束标记
    write(createChunk("chatStream", { event: "end" }));
    write(createChunk("status", { status: "success" }));
    write(createChunk("done"));
  } catch (error) {
    const errMsg = (error as Error).message;
    write(createChunk("error", { message: errMsg }));
    write(createChunk("status", { status: "failed", message: errMsg }));
  } finally {
    res.end();
  }

  // 告诉 Koa 不要再处理响应
  ctx.respond = false;
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
