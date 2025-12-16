/**
 * 任务服务
 * 处理任务相关的业务逻辑
 */
import TaskDAO from "../dao/taskDAO.js";
import type { TaskStatus } from "../dao/models/Conversation.js";

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
   * 如果没有提供标题，则根据第一条消息生成截断标题
   */
  static async createTask(userId: number, params: CreateTaskParams) {
    const { uuid, agentId, title, firstMessage } = params;

    // 生成标题：优先使用传入的标题，否则根据第一条消息截断
    const taskTitle = title || truncateTitle(firstMessage || "");

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
   */
  static async updateTaskStatus(uuid: string, status: TaskStatus) {
    return await TaskDAO.updateStatus(uuid, status);
  }

  /**
   * 检查任务是否属于指定用户
   */
  static async belongsToUser(uuid: string, userId: number) {
    return await TaskDAO.belongsToUser(uuid, userId);
  }
}

export default TaskService;
