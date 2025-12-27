/**
 * 任务服务
 * 处理任务相关的业务逻辑
 */
import TaskDAO from "../dao/taskDAO.js";
import type { TaskStatus } from "../dao/models/Conversation.js";
import TaskEventService from "./taskEventService.js";

// 创建任务参数
interface CreateTaskParams {
  uuid: string;
  agentId?: number;
  title?: string;
  firstMessage?: string;
}

// 查询任务列表参数
interface GetTasksOptions {
  keyword?: string;
  favorite?: boolean;
  page?: number;
  pageSize?: number;
}

// 更新任务参数
interface UpdateTaskParams {
  title?: string;
  favorite?: boolean;
}

/**
 * 截断标题
 * 规则：取前 20 个字符，超出部分用省略号替代
 */
export function truncateTitle(text: string, maxLength: number = 20): string {
  if (!text) return "新会话";
  const trimmed = text.trim();
  if (!trimmed) return "新会话"; // 纯空白字符串
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength) + "...";
}

class TaskService {
  /**
   * 创建任务
   * 初始标题为"新会话"，后续由 LLM 异步生成
   */
  static async createTask(userId: number, params: CreateTaskParams) {
    const { uuid, agentId, title } = params;

    // 初始标题：优先使用传入的标题，否则为"新会话"
    const taskTitle = title || "新会话";

    const task = await TaskDAO.create({
      uuid,
      userId,
      agentId,
      title: taskTitle,
      status: "running",
    });

    return task;
  }

  /**
   * 获取用户的任务列表
   */
  static async getTasks(userId: number, options: GetTasksOptions = {}) {
    return await TaskDAO.findByUserId(userId, options);
  }

  /**
   * 获取任务详情
   */
  static async getTask(uuid: string) {
    return await TaskDAO.findByUuid(uuid);
  }

  /**
   * 更新任务
   */
  static async updateTask(uuid: string, params: UpdateTaskParams) {
    return await TaskDAO.update(uuid, params);
  }

  /**
   * 删除任务
   */
  static async deleteTask(uuid: string) {
    return await TaskDAO.delete(uuid);
  }

  /**
   * 更新任务状态
   * 同时推送状态变化事件给前端
   */
  static async updateTaskStatus(uuid: string, status: TaskStatus) {
    const task = await TaskDAO.updateStatus(uuid, status);

    // 推送状态变化事件
    if (task) {
      TaskEventService.pushTaskStatusChange(
        task.userId,
        task.uuid,
        task.status,
        task.updatedAt.toISOString()
      );
    }

    return task;
  }

  /**
   * 检查任务是否属于指定用户
   */
  static async belongsToUser(uuid: string, userId: number) {
    return await TaskDAO.belongsToUser(uuid, userId);
  }

  /**
   * 更新任务标题
   * 同时推送标题更新事件给前端（用于打字机效果）
   */
  static async updateTaskTitle(uuid: string, title: string) {
    const task = await TaskDAO.update(uuid, { title });

    // 推送标题更新事件
    if (task) {
      TaskEventService.pushTitleUpdate(task.userId, task.uuid, title);
    }

    return task;
  }
}

export default TaskService;
