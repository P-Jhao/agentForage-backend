/**
 * 任务相关路由
 * 处理任务的 CRUD 操作和消息 SSE 流
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import TaskService, { truncateTitle } from "../service/taskService.js";
import TaskEventService from "../service/taskEventService.js";
import TaskStreamService from "../service/taskStreamService.js";
import ForgeAgentService from "../service/forgeAgentService.js";
import MessageSummaryService from "../service/messageSummaryService.js";
import PromptEnhanceService from "../service/promptEnhanceService.js";
import TaskAbortService from "../service/taskAbortService.js";
import TokenAccumulatorService from "../service/tokenAccumulatorService.js";
import MessageDAO from "../dao/messageDAO.js";
import TaskDAO from "../dao/taskDAO.js";
import UserDAO from "../dao/userDAO.js";
import { generateTitle } from "agentforge-gateway";
import { filterMessagesForLLM } from "../utils/messageFilter.js";
import { deleteFiles } from "../utils/fileCleanup.js";
import type { TurnEndData, TokenUsage } from "../types/turnEnd.js";

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
    // 禁用 Nginx 等代理的缓冲
    "X-Accel-Buffering": "no",
  });

  // 立即发送响应头
  res.flushHeaders();

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
  const userRole = ctx.state.user.role as string;
  const { id: uuid } = ctx.params;

  const task = await TaskService.getTask(uuid);

  if (!task) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "任务不存在" };
    return;
  }

  // 权限检查：任务所有者或 operator 可访问
  if (task.userId !== userId && userRole !== "operator") {
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

/**
 * 中断任务
 * POST /api/task/:id/abort
 * 中断正在运行的 LLM 调用，节省 token
 */
router.post("/:id/abort", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { id: uuid } = ctx.params;

  console.log(`[task.ts] ========== 收到中断请求 ==========`);
  console.log(`[task.ts] 任务 UUID: ${uuid}`);

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

  // 检查任务是否正在运行（流是否存在）
  const isRunning = TaskStreamService.isRunning(uuid);
  console.log(`[task.ts] 任务流运行状态: ${isRunning}`);

  // 无论流是否在运行，都尝试中断 Gateway 层的 LLM 调用
  // 因为 LLM 可能还在输出，只是流已经结束了
  console.log(`[task.ts] 调用 TaskAbortService.abort() 中断 LLM...`);
  const aborted = TaskAbortService.abort(uuid);
  console.log(`[task.ts] TaskAbortService.abort() 返回: ${aborted}`);

  if (isRunning) {
    // 流还在运行，发送中断消息并结束流
    console.log(`[task.ts] 流正在运行，发送中断消息并结束流`);
    TaskStreamService.write(uuid, { type: "error", data: { message: "任务已被中断" } });
    TaskStreamService.write(uuid, { type: "done" });
    TaskStreamService.endStream(uuid);
  } else {
    console.log(`[task.ts] 流已结束，仅中断 Gateway 层 LLM`);
  }

  // 更新任务状态
  await TaskService.updateTaskStatus(uuid, "completed");

  console.log(`[task.ts] ========== 中断处理完成 ==========`);
  ctx.body = { code: 200, message: "ok", data: { aborted: true } };
});

// 发送消息请求体
interface SendMessageBody {
  content?: string; // 用户消息内容（发送新消息时必填）
  loadHistory?: boolean; // 是否加载历史消息
  enableThinking?: boolean; // 是否启用深度思考（默认 false）
  // 提示词增强相关参数
  enhanceMode?: "off" | "quick" | "smart" | "multi"; // 增强模式
  // 智能迭代模式中，用户回复澄清问题时使用
  iterateContext?: {
    originalPrompt: string;
    reviewerOutput: string;
    questionerOutput: string;
  };
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
    | "done"
    // 提示词增强相关类型
    | "user_original" // 用户原始输入（增强模式下）
    | "reviewer" // 审查者输出
    | "questioner" // 提问者输出
    | "expert" // 专家分析输出
    | "enhancer" // 增强后的提示词
    // 轮次结束统计
    | "turn_end";
  data?: unknown;
}

// 工具调用开始数据（从 Gateway 接收）
interface ToolCallStartData {
  callId: string;
  toolName: string;
}

// 工具调用结果数据（从 Gateway 接收）
interface ToolCallResultData {
  callId: string;
  toolName: string;
  success: boolean;
  summarizedResult?: string; // Markdown 格式摘要
  error?: string;
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
    enhanceMode = "off",
    iterateContext,
    files,
  } = ctx.request.body as SendMessageBody;

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
    // 禁用 Nginx 等代理的缓冲
    "X-Accel-Buffering": "no",
  });

  // 立即发送响应头，确保连接建立
  res.flushHeaders();

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

      // 检查是否有正在进行的流（内存中的实际状态），防止并发发送消息
      if (TaskStreamService.isRunning(uuid)) {
        write({ type: "error", data: { message: "任务正在执行中，请等待完成后再发送新消息" } });
        res.end();
        ctx.respond = false;
        return;
      }

      // 如果数据库状态是 running 但流已结束，说明之前异常退出，修复状态
      // 注意：只有当任务确实在运行中（有活跃的流）时才需要修复
      // 新任务或已完成的任务不需要修复
      if (task.status === "running" && !TaskStreamService.isRunning(uuid)) {
        // 静默修复状态，不推送事件（避免触发通知）
        await TaskDAO.updateStatus(uuid, "completed");
      }

      // 根据增强模式决定用户消息类型
      // 智能迭代模式中用户回复澄清问题时，类型为 user_answer
      // 其他增强模式开启时，类型为 user_original
      // 关闭增强时，类型为 chat
      const userMessageType = iterateContext
        ? "user_answer"
        : enhanceMode !== "off"
          ? "user_original"
          : "chat";

      // 保存用户消息（包含文件信息）
      await MessageDAO.createUserMessage(task.id, content, files, userMessageType);

      // 如果是第一条消息（标题为"新会话"），立即异步生成标题
      // 不等待 LLM 回复，这样即使用户中断也能有标题
      if (task.title === "新会话") {
        (async () => {
          try {
            console.log("[task.ts] 开始异步生成标题...");
            const generatedTitle = await generateTitle(content);
            if (generatedTitle) {
              await TaskService.updateTaskTitle(uuid, generatedTitle);
              console.log("[task.ts] 标题生成成功:", generatedTitle);
            } else {
              const fallbackTitle = truncateTitle(content);
              await TaskService.updateTaskTitle(uuid, fallbackTitle);
              console.log("[task.ts] 标题生成失败，使用截断标题:", fallbackTitle);
            }
          } catch (error) {
            console.error("[task.ts] 标题生成异常:", error);
            const fallbackTitle = truncateTitle(content);
            await TaskService.updateTaskTitle(uuid, fallbackTitle).catch(() => {});
          }
        })();
      }

      // 更新任务状态为 running
      await TaskService.updateTaskStatus(uuid, "running");

      // 开始任务流（支持多订阅者）
      TaskStreamService.startStream(uuid);

      // 初始化 token 累积器（如果已存在则保留，用于多轮对话累积）
      if (!TokenAccumulatorService.has(uuid)) {
        // 尝试从历史 turn_end 消息恢复累积值
        const lastTurnEnd = await MessageDAO.getLastTurnEndMessage(task.id);
        if (lastTurnEnd) {
          TokenAccumulatorService.init(uuid, lastTurnEnd.accumulatedTokens);
        } else {
          TokenAccumulatorService.init(uuid);
        }
      }

      // 将当前连接添加为订阅者
      TaskStreamService.subscribe(uuid, res);

      // 连接由 TaskStreamService 管理
      managedByStreamService = true;

      // 监听连接关闭
      ctx.req.on("close", () => {
        TaskStreamService.unsubscribe(uuid, res);
      });

      // ========== 提示词增强流程 ==========
      // 根据增强模式处理用户消息
      let finalPrompt = content; // 最终发送给对话 LLM 的提示词
      let skipLLMCall = false; // 是否跳过对话 LLM 调用（智能迭代等待用户回复时）

      if (enhanceMode === "quick") {
        // 快速增强模式：直接增强后调用对话 LLM
        console.log("[task.ts] 执行快速增强...");
        const result = await PromptEnhanceService.quickEnhance(uuid, task.id, content);
        if (result.success) {
          finalPrompt = result.enhancedPrompt;
        } else {
          console.warn("[task.ts] 快速增强失败，使用原始提示词:", result.error);
        }
      } else if (enhanceMode === "smart") {
        if (iterateContext) {
          // 智能迭代模式 - 用户已回复澄清问题，执行增强阶段
          console.log("[task.ts] ========== 智能迭代增强阶段 ==========");
          console.log("[task.ts] iterateContext:", JSON.stringify(iterateContext, null, 2));
          console.log("[task.ts] userAnswer:", content);
          const result = await PromptEnhanceService.smartEnhance(uuid, task.id, {
            originalPrompt: iterateContext.originalPrompt,
            reviewerOutput: iterateContext.reviewerOutput,
            questionerOutput: iterateContext.questionerOutput,
            userAnswer: content,
          });
          console.log("[task.ts] smartEnhance 结果:", result.success, result.error || "");
          if (result.success) {
            finalPrompt = result.enhancedPrompt;
            console.log("[task.ts] 增强后的提示词长度:", finalPrompt.length);
          } else {
            console.warn("[task.ts] 智能迭代增强失败，使用原始提示词:", result.error);
            finalPrompt = iterateContext.originalPrompt;
          }
        } else {
          // 智能迭代模式 - 首次发送，执行审查和提问阶段
          console.log("[task.ts] 执行智能迭代审查和提问阶段...");
          const result = await PromptEnhanceService.smartReviewAndQuestion(uuid, task.id, content);
          if (result.success) {
            // 审查和提问完成，等待用户回复，不调用对话 LLM
            skipLLMCall = true;
          } else {
            console.warn("[task.ts] 智能迭代审查/提问失败，使用原始提示词");
          }
        }
      } else if (enhanceMode === "multi") {
        // 多角度增强模式：专家分析 + 评审官综合
        console.log("[task.ts] 执行多角度增强...");
        const result = await PromptEnhanceService.multiEnhance(uuid, task.id, content);
        if (result.success) {
          finalPrompt = result.enhancedPrompt;
        } else {
          console.warn("[task.ts] 多角度增强失败，使用原始提示词:", result.error);
        }
      }

      // 检查增强过程中是否被中断
      if (TaskAbortService.isAborted(uuid)) {
        console.log(`[task.ts] 任务在增强阶段被中断: ${uuid}`);
        await TaskService.updateTaskStatus(uuid, "completed");
        TaskAbortService.cleanup(uuid);

        // 增强阶段中断也写入 turn_end（token 可能为 0 或部分累积值）
        const turnEndData: TurnEndData = {
          completedAt: new Date().toISOString(),
          accumulatedTokens: TokenAccumulatorService.get(uuid),
        };
        await MessageDAO.createTurnEndMessage(task.id, turnEndData);

        TaskStreamService.write(uuid, { type: "done" });
        TaskStreamService.endStream(uuid);
        ctx.respond = false;
        return;
      }

      // 如果跳过 LLM 调用（智能迭代等待用户回复），设置为 waiting 状态
      if (skipLLMCall) {
        await TaskService.updateTaskStatus(uuid, "waiting");
        TaskStreamService.write(uuid, { type: "done" });
        TaskStreamService.endStream(uuid);
        ctx.respond = false;
        return;
      }

      // ========== 调用对话 LLM ==========
      // 获取历史消息构建上下文（用于 LLM）
      // 使用扁平格式，已解析 JSON 字段
      const history = await MessageDAO.findFlatByConversationId(task.id);

      // 过滤增强过程消息，只保留对话相关消息
      const filteredHistory = filterMessagesForLLM(history);

      // 获取会话总结信息，使用 MessageSummaryService 构建上下文
      const summaryInfo = await MessageSummaryService.getConversationSummaryInfo(task.id);
      // 使用过滤后的历史消息构建上下文
      const chatMessages = MessageSummaryService.buildContextMessages(summaryInfo, filteredHistory);

      // 如果有增强后的提示词，替换最后一条用户消息的内容
      if (enhanceMode !== "off" && finalPrompt !== content) {
        // 找到最后一条用户消息并替换内容
        for (let i = chatMessages.length - 1; i >= 0; i--) {
          if (chatMessages[i].role === "user") {
            chatMessages[i].content = finalPrompt;
            break;
          }
        }
      }

      // 当前正在拼接的文本段落（用于流式输出时合并同类型内容）
      let currentTextContent = "";
      // 当前正在拼接的 thinking 段落
      let currentThinkingContent = "";
      // 当前正在拼接的 summary 段落
      let currentSummaryContent = "";
      // 标记是否被中断
      let wasAborted = false;

      // 辅助函数：保存已累积的内容到数据库
      const saveAccumulatedContent = async (aborted: boolean = false) => {
        // 保存 thinking 段落
        if (currentThinkingContent) {
          await MessageDAO.createAssistantTextMessage({
            conversationId: task.id,
            role: "assistant",
            type: "thinking",
            content: currentThinkingContent,
            aborted,
          });
          currentThinkingContent = "";
        }

        // 保存 chat 段落
        if (currentTextContent) {
          await MessageDAO.createAssistantTextMessage({
            conversationId: task.id,
            role: "assistant",
            type: "chat",
            content: currentTextContent,
            aborted,
          });
          currentTextContent = "";
        }

        // 保存 summary 段落
        if (currentSummaryContent) {
          await MessageDAO.createAssistantTextMessage({
            conversationId: task.id,
            role: "assistant",
            type: "summary",
            content: currentSummaryContent,
            aborted,
          });
          currentSummaryContent = "";
        }

        // 内容已保存到数据库，清空缓冲区
        // 新订阅者将从数据库加载历史消息，不需要从缓冲区追赶
        TaskStreamService.clearBuffer(uuid);
      };

      // 构建内置工具激活上下文（从文件信息中提取路径和原始文件名）
      const fileInfos =
        files?.map((f) => ({
          path: f.filePath,
          originalName: f.originalName,
        })) || [];
      const builtinContext = fileInfos.length > 0 ? { files: fileInfos } : undefined;

      // 从数据库读取用户的自定义模型配置
      const userModelConfig = await UserDAO.getModelConfig(userId);
      // 转换为 Gateway 需要的格式（仅当 mode 为 custom 时传递）
      const customModelConfig =
        userModelConfig?.mode === "custom" &&
        userModelConfig.baseUrl &&
        userModelConfig.apiKey &&
        userModelConfig.model
          ? {
              baseUrl: userModelConfig.baseUrl,
              apiKey: userModelConfig.apiKey,
              model: userModelConfig.model,
              maxTokens: userModelConfig.maxTokens,
              temperature: userModelConfig.temperature,
            }
          : undefined;

      // 调用 ForgeAgentService 流式获取 Agent 回复
      // task.agentId 为空时，Agent 无工具；有值时，获取 Forge 关联的工具
      try {
        for await (const chunk of ForgeAgentService.stream(
          task.agentId,
          chatMessages,
          undefined,
          enableThinking,
          builtinContext,
          uuid, // 传入任务 ID 用于中断控制
          customModelConfig // 自定义模型配置
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
              // 清空缓冲区
              TaskStreamService.clearBuffer(uuid);
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
              // 清空缓冲区
              TaskStreamService.clearBuffer(uuid);
            }

            // 创建工具调用消息（初始状态，不包含参数）
            await MessageDAO.createToolCallMessage({
              conversationId: task.id,
              callId: toolData.callId,
              toolName: toolData.toolName,
            });

            // 推送 tool_call_start 给前端（不包含参数）
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

            // 更新工具调用结果（使用摘要结果）
            await MessageDAO.updateToolCallResult(resultData.callId, {
              success: resultData.success,
              summarizedResult: resultData.summarizedResult,
              error: resultData.error,
            });

            // 推送 tool_call_result 给前端（使用摘要结果，不包含参数）
            TaskStreamService.write(uuid, {
              type: "tool_call_result",
              data: {
                callId: resultData.callId,
                toolName: resultData.toolName,
                success: resultData.success,
                summarizedResult: resultData.summarizedResult,
                error: resultData.error,
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
                // 清空缓冲区
                TaskStreamService.clearBuffer(uuid);
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
                // 清空缓冲区
                TaskStreamService.clearBuffer(uuid);
              }
              // 累积 summary 内容
              currentSummaryContent += chunkData;
            }
            // 通过 TaskStreamService 写入
            TaskStreamService.write(uuid, { type: "summary", data: chunkData });
            continue;
          }

          // 处理 usage 类型（token 使用统计）
          if (chunk.type === "usage") {
            const usageData = chunk.data as TokenUsage;
            if (usageData) {
              TokenAccumulatorService.add(uuid, usageData);
            }
            continue;
          }

          // 处理其他类型（error 等）
          const chunkData = chunk.data as string;
          TaskStreamService.write(uuid, { type: chunk.type, data: chunkData });
        }
      } catch (streamError) {
        // 检查是否是中断导致的错误
        const errorMessage = (streamError as Error).message || "";
        if (
          errorMessage.includes("aborted") ||
          errorMessage.includes("中断") ||
          TaskAbortService.isAborted(uuid)
        ) {
          console.log(`[task.ts] LLM 流被中断: ${uuid}`);
          wasAborted = true;
          // 保存已累积的内容（标记为已中断）
          await saveAccumulatedContent(true);
        } else {
          // 其他错误，重新抛出
          throw streamError;
        }
      }

      // 如果没有被中断，正常保存内容
      if (!wasAborted) {
        await saveAccumulatedContent();
      }

      // 保存最后一个 thinking 段落（兼容旧逻辑，如果 saveAccumulatedContent 没有清空的话）
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

      // 所有内容已保存，清空缓冲区
      TaskStreamService.clearBuffer(uuid);

      // 更新任务状态为 completed
      await TaskService.updateTaskStatus(uuid, "completed");

      // 清理中断状态
      TaskAbortService.cleanup(uuid);

      // 清理用户上传的临时文件（LLM 已解析完成，不再需要）
      if (files && files.length > 0) {
        const filePaths = files.map((f) => f.filePath);
        deleteFiles(filePaths).catch((error) => {
          console.error("[task.ts] 清理上传文件失败:", error);
        });
      }

      // LLM 回复完成后，异步检查并触发消息总结（不阻塞主流程）
      MessageSummaryService.checkAndTriggerSummary(task.id).catch((error) => {
        console.error("[task.ts] 触发消息总结失败:", error);
      });

      // 发送 turn_end 消息（正常完成和中断都发送，中断时 token 可能是部分累积值）
      const turnEndData: TurnEndData = {
        completedAt: new Date().toISOString(),
        accumulatedTokens: TokenAccumulatorService.get(uuid),
      };

      // 持久化 turn_end 消息到数据库
      await MessageDAO.createTurnEndMessage(task.id, turnEndData);

      // 推送 turn_end 给前端
      TaskStreamService.write(uuid, { type: "turn_end", data: turnEndData });

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
