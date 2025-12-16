/**
 * 任务相关路由
 * 处理任务的 CRUD 操作和消息 SSE 流
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import TaskService from "../service/taskService.js";
import TaskEventService from "../service/taskEventService.js";
import TaskStreamService from "../service/taskStreamService.js";
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
 * 订阅任务状态变化（SSE 长连接）
 * GET /api/task/subscribe
 *
 * 前端在 Layout 初始化时建立连接，接收任务状态实时推送
 * 注意：此路由必须在 /:id 之前定义，否则 subscribe 会被当作 id 参数
 */
router.get("/subscribe", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;

  // 获取原生响应对象
  const res = ctx.res;

  // 设置 SSE 响应头
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // 发送初始连接成功消息
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  // 添加到连接池
  TaskEventService.addConnection(userId, res);

  // 监听连接关闭
  ctx.req.on("close", () => {
    TaskEventService.removeConnection(userId, res);
  });

  // 保持连接，定期发送心跳
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000); // 每 30 秒发送一次心跳

  // 连接关闭时清理心跳
  ctx.req.on("close", () => {
    clearInterval(heartbeat);
  });

  // 告诉 Koa 不要再处理响应
  ctx.respond = false;
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

  // 标记是否由 TaskStreamService 管理连接（不需要手动关闭）
  let managedByStreamService = false;

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

      // 检查任务是否正在运行，如果是则订阅流
      if (task.status === "running" && TaskStreamService.isRunning(uuid)) {
        // 订阅正在进行的流，接收后续输出
        const subscribed = TaskStreamService.subscribe(uuid, res);
        if (subscribed) {
          // 成功订阅，监听连接关闭
          ctx.req.on("close", () => {
            TaskStreamService.unsubscribe(uuid, res);
          });
          // 连接由 TaskStreamService 管理
          managedByStreamService = true;
          ctx.respond = false;
          return;
        }
      }

      // 任务不在运行或订阅失败，发送 done
      write({ type: "done" });
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

      // 开始任务流（支持多订阅者）
      TaskStreamService.startStream(uuid);

      // 将当前连接添加为订阅者
      TaskStreamService.subscribe(uuid, res);

      // 连接由 TaskStreamService 管理
      managedByStreamService = true;

      // 监听连接关闭
      ctx.req.on("close", () => {
        TaskStreamService.unsubscribe(uuid, res);
      });

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

        // 通过 TaskStreamService 写入（会同时写入缓冲区和所有订阅者）
        TaskStreamService.write(uuid, { type: chunkType, data: chunk.content });
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

      // 发送结束标记并结束流（会关闭所有订阅者连接）
      TaskStreamService.write(uuid, { type: "done" });
      TaskStreamService.endStream(uuid);

      ctx.respond = false;
      return;
    }
  } catch (error) {
    const errMsg = (error as Error).message;
    write({ type: "error", data: { message: errMsg } });
    // 如果流存在，也写入错误
    if (TaskStreamService.isRunning(uuid)) {
      TaskStreamService.write(uuid, { type: "error", data: { message: errMsg } });
      TaskStreamService.endStream(uuid);
    }
  } finally {
    // 只有不由 TaskStreamService 管理的连接才需要手动关闭
    if (!managedByStreamService) {
      res.end();
    }
  }

  // 告诉 Koa 不要再处理响应
  ctx.respond = false;
});

export default router;
