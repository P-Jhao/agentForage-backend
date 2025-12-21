/**
 * 任务相关路由
 * 处理任务的 CRUD 操作和消息 SSE 流
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import TaskService from "../service/taskService.js";
import TaskEventService from "../service/taskEventService.js";
import TaskStreamService from "../service/taskStreamService.js";
import ForgeAgentService from "../service/forgeAgentService.js";
import MessageDAO from "../dao/messageDAO.js";

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
  enableThinking?: boolean; // 是否启用深度思考（默认 false）
  files?: Array<{
    filePath: string;
    originalName: string;
    size: number;
    url: string;
  }>; // 用户上传的文件信息列表
}

// SSE 消息类型
interface SSEChunk {
  type:
    | "history"
    | "thinking"
    | "chat"
    | "tool_call_start"
    | "tool_call_result"
    | "summary"
    | "error"
    | "done";
  data?: unknown;
}

// 工具调用开始数据（从 Gateway 接收）
interface ToolCallStartData {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}

// 工具调用结果数据（从 Gateway 接收）
interface ToolCallResultData {
  callId: string;
  toolName: string;
  success: boolean;
  result?: string;
  error?: string;
  args?: Record<string, unknown>; // 工具 LLM 决定的参数
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
  const {
    content,
    loadHistory,
    enableThinking = false,
    files,
  } = ctx.request.body as SendMessageBody;

  // 调试日志
  console.log("[task.ts] 收到请求体:", JSON.stringify(ctx.request.body, null, 2));
  console.log("[task.ts] files:", files);

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
      // 加载历史消息（使用扁平格式）
      const messages = await MessageDAO.findFlatByConversationId(task.id);

      // 发送历史消息
      write({ type: "history", data: messages });

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

      // 保存用户消息（包含文件信息）
      await MessageDAO.createUserMessage(task.id, content, files);

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

      // 获取历史消息构建上下文（用于 LLM）
      // 使用扁平格式，已解析 JSON 字段
      const history = await MessageDAO.findFlatByConversationId(task.id);
      const chatMessages: { role: "user" | "assistant" | "system"; content: string }[] = [];

      // 将消息转换为 LLM 上下文格式
      // 需要包含工具调用信息，让 AI 理解之前做过什么操作
      let currentAssistantContent = "";
      let lastRole: string | null = null;

      for (const msg of history) {
        if (msg.role === "user") {
          // 保存之前的 assistant 内容
          if (lastRole === "assistant" && currentAssistantContent) {
            chatMessages.push({ role: "assistant", content: currentAssistantContent });
            currentAssistantContent = "";
          }
          chatMessages.push({ role: "user", content: msg.content });
          lastRole = "user";
        } else if (msg.role === "assistant") {
          // 收集所有类型的内容，包括工具调用
          if (msg.type === "tool_call") {
            // 将工具调用信息转换为文本描述，让 AI 知道之前调用过什么工具
            const toolName = msg.toolName || "unknown";
            const toolArgs = msg.arguments ? JSON.stringify(msg.arguments) : "{}";
            const toolResult = msg.result ? JSON.stringify(msg.result) : "无结果";
            const toolInfo = `[调用工具 ${toolName}，参数: ${toolArgs}，结果: ${toolResult}]`;
            currentAssistantContent += (currentAssistantContent ? "\n" : "") + toolInfo;
          } else if (msg.content) {
            // 文本内容（chat/thinking/error）
            currentAssistantContent += (currentAssistantContent ? "\n" : "") + msg.content;
          }
          lastRole = "assistant";
        }
      }
      // 保存最后的 assistant 内容
      if (lastRole === "assistant" && currentAssistantContent) {
        chatMessages.push({ role: "assistant", content: currentAssistantContent });
      }

      // 当前正在拼接的文本段落（用于流式输出时合并同类型内容）
      let currentTextContent = "";
      // 当前正在拼接的 thinking 段落
      let currentThinkingContent = "";
      // 当前正在拼接的 summary 段落
      let currentSummaryContent = "";

      // 构建内置工具激活上下文（从文件信息中提取路径）
      const filePaths = files?.map((f) => f.filePath) || [];
      const builtinContext = filePaths.length > 0 ? { files: filePaths } : undefined;

      // 调用 ForgeAgentService 流式获取 Agent 回复
      // task.agentId 为空时，Agent 无工具；有值时，获取 Forge 关联的工具
      for await (const chunk of ForgeAgentService.stream(
        task.agentId,
        chatMessages,
        undefined,
        enableThinking,
        builtinContext
      )) {
        const chunkType = chunk.type;

        // 处理工具调用开始（Gateway 发出 tool_call_start）
        if (chunkType === "tool_call_start") {
          const toolData = chunk.data as ToolCallStartData;

          // 如果有正在进行的文本段落，先保存到数据库
          if (currentTextContent) {
            await MessageDAO.createAssistantTextMessage({
              conversationId: task.id,
              role: "assistant",
              type: "chat",
              content: currentTextContent,
            });
            currentTextContent = "";
          }

          // 如果有正在进行的 thinking 段落，先保存到数据库
          if (currentThinkingContent) {
            await MessageDAO.createAssistantTextMessage({
              conversationId: task.id,
              role: "assistant",
              type: "thinking",
              content: currentThinkingContent,
            });
            currentThinkingContent = "";
          }

          // 创建工具调用消息（初始状态）
          await MessageDAO.createToolCallMessage({
            conversationId: task.id,
            callId: toolData.callId,
            toolName: toolData.toolName,
            arguments: toolData.args,
          });

          // 推送 tool_call_start 给前端
          TaskStreamService.write(uuid, {
            type: "tool_call_start",
            data: {
              callId: toolData.callId,
              toolName: toolData.toolName,
            },
          });
          continue;
        }

        // 处理工具调用结果（Gateway 发出 tool_call_result）
        if (chunkType === "tool_call_result") {
          const resultData = chunk.data as ToolCallResultData;

          // 更新工具调用结果（包含参数）
          await MessageDAO.updateToolCallResult(resultData.callId, {
            success: resultData.success,
            result: resultData.result,
            error: resultData.error,
            arguments: resultData.args, // 保存工具 LLM 决定的参数
          });

          // 推送 tool_call_result 给前端
          TaskStreamService.write(uuid, {
            type: "tool_call_result",
            data: {
              callId: resultData.callId,
              toolName: resultData.toolName,
              success: resultData.success,
              result: resultData.result,
              error: resultData.error,
              args: resultData.args, // 包含工具 LLM 决定的参数
            },
          });
          continue;
        }

        // 处理 chat 类型的文本内容
        if (chunkType === "chat") {
          const chunkData = chunk.data as string;
          if (chunkData) {
            // 如果有正在进行的 thinking 段落，先保存到数据库
            if (currentThinkingContent) {
              await MessageDAO.createAssistantTextMessage({
                conversationId: task.id,
                role: "assistant",
                type: "thinking",
                content: currentThinkingContent,
              });
              currentThinkingContent = "";
            }
            currentTextContent += chunkData;
          }

          // 通过 TaskStreamService 写入
          TaskStreamService.write(uuid, { type: "chat", data: chunkData });
          continue;
        }

        // 处理 thinking 类型的文本内容
        if (chunkType === "thinking") {
          const chunkData = chunk.data as string;
          if (chunkData) {
            // 累积 thinking 内容，不立即保存
            currentThinkingContent += chunkData;
          }

          // 通过 TaskStreamService 写入
          TaskStreamService.write(uuid, { type: "thinking", data: chunkData });
          continue;
        }

        // 处理 summary 类型的文本内容
        if (chunk.type === "summary") {
          const chunkData = chunk.data as string;
          if (chunkData) {
            // 如果有正在进行的 chat 段落，先保存到数据库
            if (currentTextContent) {
              await MessageDAO.createAssistantTextMessage({
                conversationId: task.id,
                role: "assistant",
                type: "chat",
                content: currentTextContent,
              });
              currentTextContent = "";
            }
            // 累积 summary 内容
            currentSummaryContent += chunkData;
          }
          // 通过 TaskStreamService 写入
          TaskStreamService.write(uuid, { type: "summary", data: chunkData });
          continue;
        }

        // 处理其他类型（error 等）
        const chunkData = chunk.data as string;
        TaskStreamService.write(uuid, { type: chunk.type, data: chunkData });
      }

      // 保存最后一个 thinking 段落
      if (currentThinkingContent) {
        await MessageDAO.createAssistantTextMessage({
          conversationId: task.id,
          role: "assistant",
          type: "thinking",
          content: currentThinkingContent,
        });
      }

      // 保存最后一个文本段落
      if (currentTextContent) {
        await MessageDAO.createAssistantTextMessage({
          conversationId: task.id,
          role: "assistant",
          type: "chat",
          content: currentTextContent,
        });
      }

      // 保存最后一个 summary 段落
      if (currentSummaryContent) {
        await MessageDAO.createAssistantTextMessage({
          conversationId: task.id,
          role: "assistant",
          type: "summary",
          content: currentSummaryContent,
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
