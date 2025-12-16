/**
 * 任务相关路由
 * 处理任务的 CRUD 操作和消息 SSE 流
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import TaskService from "../service/taskService.js";
import MessageDAO from "../dao/messageDAO.js";
import type { MessageSegment } from "../dao/models/Message.js";
import Message from "../dao/models/Message.js";

// 动态导入 gateway
const loadGateway = async () => {
  return await import("agentforge-gateway");
};

const router = new Router();

// 创建任务请求体
interface CreateTaskBody {
  id: string; // 前端生成的 UUID
  agentId?: number;
  title?: string;
  firstMessage?: string;
}

// 更新任务请求体
interface UpdateTaskBody {
  title?: string;
  favorite?: boolean;
}

/**
 * 创建任务
 * POST /api/task
 */
router.post("/", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { id: uuid, agentId, title, firstMessage } = ctx.request.body as CreateTaskBody;

  // 参数验证
  if (!uuid || typeof uuid !== "string") {
    ctx.status = 400;
    ctx.body = { code: 400, message: "任务 ID 不能为空" };
    return;
  }

  // 检查 UUID 是否已存在
  const existing = await TaskService.getTask(uuid);
  if (existing) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "任务已存在" };
    return;
  }

  const task = await TaskService.createTask(userId, {
    uuid,
    agentId,
    title,
    firstMessage,
  });

  ctx.body = { code: 200, message: "ok", data: task };
});

/**
 * 获取任务列表
 * GET /api/task/list
 */
router.get("/list", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { keyword, favorite } = ctx.query;

  const tasks = await TaskService.getTasks(userId, {
    keyword: keyword as string | undefined,
    favorite: favorite === "true" ? true : favorite === "false" ? false : undefined,
  });

  ctx.body = { code: 200, message: "ok", data: tasks };
});

/**
 * 获取任务详情
 * GET /api/task/:id
 */
router.get("/:id", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { id: uuid } = ctx.params;

  const task = await TaskService.getTask(uuid);

  if (!task) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "任务不存在" };
    return;
  }

  // 权限检查
  if (task.userId !== userId) {
    ctx.status = 403;
    ctx.body = { code: 403, message: "无权访问该任务" };
    return;
  }

  ctx.body = { code: 200, message: "ok", data: task };
});

/**
 * 更新任务
 * PUT /api/task/:id
 */
router.put("/:id", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { id: uuid } = ctx.params;
  const { title, favorite } = ctx.request.body as UpdateTaskBody;

  // 权限检查
  const belongsToUser = await TaskService.belongsToUser(uuid, userId);
  if (!belongsToUser) {
    const task = await TaskService.getTask(uuid);
    if (!task) {
      ctx.status = 404;
      ctx.body = { code: 404, message: "任务不存在" };
    } else {
      ctx.status = 403;
      ctx.body = { code: 403, message: "无权访问该任务" };
    }
    return;
  }

  const updatedTask = await TaskService.updateTask(uuid, { title, favorite });

  ctx.body = { code: 200, message: "ok", data: updatedTask };
});

/**
 * 删除任务
 * DELETE /api/task/:id
 */
router.delete("/:id", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { id: uuid } = ctx.params;

  // 权限检查
  const belongsToUser = await TaskService.belongsToUser(uuid, userId);
  if (!belongsToUser) {
    const task = await TaskService.getTask(uuid);
    if (!task) {
      ctx.status = 404;
      ctx.body = { code: 404, message: "任务不存在" };
    } else {
      ctx.status = 403;
      ctx.body = { code: 403, message: "无权访问该任务" };
    }
    return;
  }

  await TaskService.deleteTask(uuid);

  ctx.body = { code: 200, message: "ok" };
});

// 发送消息请求体
interface SendMessageBody {
  content?: string; // 用户消息内容（发送新消息时必填）
  loadHistory?: boolean; // 是否加载历史消息
}

// SSE 消息类型
interface SSEChunk {
  type: "history" | "thinking" | "chat" | "tool" | "error" | "done";
  data?: unknown;
}

/**
 * 发送消息 / 加载历史消息
 * POST /api/task/:id/message
 *
 * 使用 NDJSON 格式流式返回
 */
router.post("/:id/message", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { id: uuid } = ctx.params;
  const { content, loadHistory } = ctx.request.body as SendMessageBody;

  // 权限检查
  const task = await TaskService.getTask(uuid);
  if (!task) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "任务不存在" };
    return;
  }
  if (task.userId !== userId) {
    ctx.status = 403;
    ctx.body = { code: 403, message: "无权访问该任务" };
    return;
  }

  // 获取原生响应对象，绕过 Koa 的响应缓冲
  const res = ctx.res;

  // 设置 SSE 响应头
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // 写入 NDJSON 格式数据
  const write = (chunk: SSEChunk) => {
    res.write(JSON.stringify(chunk) + "\n");
  };

  try {
    if (loadHistory) {
      // 加载历史消息
      const messages = await MessageDAO.findByConversationId(task.id);

      // 转换消息格式，解析 assistant 消息的 JSON content
      const formattedMessages = messages.map((msg: Message) => ({
        id: msg.id,
        role: msg.role,
        content: msg.getParsedContent(),
        createdAt: msg.createdAt,
      }));

      // 发送历史消息
      write({ type: "history", data: formattedMessages });

      // 根据任务状态决定是否补发 done
      if (task.status !== "running") {
        write({ type: "done" });
      }
    } else {
      // 发送新消息
      if (!content || typeof content !== "string") {
        write({ type: "error", data: { message: "消息内容不能为空" } });
        res.end();
        ctx.respond = false;
        return;
      }

      // 保存用户消息
      await MessageDAO.createUserMessage(task.id, content);

      // 更新任务状态为 running
      await TaskService.updateTaskStatus(uuid, "running");

      // 获取历史消息构建上下文
      const history = await MessageDAO.findByConversationId(task.id);
      const chatMessages = history.map((msg: Message) => {
        if (msg.role === "assistant") {
          // 将段落数组合并为单个字符串
          const segments = msg.getParsedContent() as MessageSegment[];
          const combinedContent = segments.map((s) => s.content).join("\n");
          return { role: "assistant" as const, content: combinedContent };
        }
        return { role: msg.role as "user" | "system", content: msg.content };
      });

      // 用于收集 LLM 回复的段落
      const segments: MessageSegment[] = [];
      let currentSegment: MessageSegment | null = null;

      // 调用 Gateway 流式获取 LLM 回复
      const { chatService } = await loadGateway();
      for await (const chunk of chatService.stream({ messages: chatMessages })) {
        // 当前简化处理：所有输出都当作 chat 类型
        const chunkType = "chat";

        if (!currentSegment || currentSegment.type !== chunkType) {
          // 开始新段落
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = { type: chunkType, content: chunk.content };
        } else {
          // 拼接到当前段落
          currentSegment.content += chunk.content;
        }

        // 流式返回给前端
        write({ type: chunkType, data: chunk.content });
      }

      // 保存最后一个段落
      if (currentSegment) {
        segments.push(currentSegment);
      }

      // 保存 assistant 消息到数据库
      if (segments.length > 0) {
        await MessageDAO.createAssistantMessage({
          conversationId: task.id,
          segments,
        });
      }

      // 更新任务状态为 completed
      await TaskService.updateTaskStatus(uuid, "completed");

      // 发送结束标记
      write({ type: "done" });
    }
  } catch (error) {
    const errMsg = (error as Error).message;
    write({ type: "error", data: { message: errMsg } });
  } finally {
    res.end();
  }

  // 告诉 Koa 不要再处理响应
  ctx.respond = false;
});

export default router;
