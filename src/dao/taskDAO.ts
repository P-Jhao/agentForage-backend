/**
 * 任务数据访问对象
 * 处理任务（会话）的数据库操作
 */
import { Op } from "sequelize";
import { Conversation, Message, Agent } from "./models/index.js";
import type { TaskStatus } from "./models/Conversation.js";

// 创建任务参数
interface CreateTaskData {
  uuid: string;
  userId: number;
  agentId?: number;
  title: string;
  status?: TaskStatus;
}

// 查询任务列表参数
interface FindTasksOptions {
  keyword?: string;
  favorite?: boolean;
  page?: number;
  pageSize?: number;
}

// 查询任务列表返回结果
export interface FindTasksResult {
  tasks: Conversation[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
  };
}

// 更新任务参数
interface UpdateTaskData {
  title?: string;
  favorite?: boolean;
  status?: TaskStatus;
}

class TaskDAO {
  /**
   * 创建任务
   * 注意：agentId 为 0 或未提供时设为 null，避免外键约束失败
   */
  static async create(data: CreateTaskData) {
    return await Conversation.create({
      uuid: data.uuid,
      userId: data.userId,
      agentId: data.agentId && data.agentId > 0 ? data.agentId : null,
      title: data.title,
      status: data.status ?? "running",
    });
  }

  /**
   * 按 UUID 查询任务（包含关联的 Forge 信息）
   */
  static async findByUuid(uuid: string) {
    return await Conversation.findOne({
      where: { uuid },
      include: [
        {
          model: Agent,
          as: "agent",
          attributes: ["id", "displayName", "avatar"],
          required: false,
        },
      ],
    });
  }

  /**
   * 按用户 ID 查询任务列表（包含关联的 Forge 信息）
   * 支持关键词搜索、收藏筛选和分页
   * 按 updatedAt 降序排序
   */
  static async findByUserId(
    userId: number,
    options: FindTasksOptions = {}
  ): Promise<FindTasksResult> {
    const { keyword, favorite, page = 1, pageSize = 10 } = options;

    // 构建查询条件
    const where: Record<string, unknown> = { userId };

    // 关键词搜索（标题模糊匹配）
    if (keyword) {
      where.title = { [Op.like]: `%${keyword}%` };
    }

    // 收藏筛选
    if (favorite !== undefined) {
      where.favorite = favorite;
    }

    // 计算分页偏移
    const offset = (page - 1) * pageSize;

    const { count, rows } = await Conversation.findAndCountAll({
      where,
      order: [["updatedAt", "DESC"]],
      include: [
        {
          model: Agent,
          as: "agent",
          attributes: ["id", "displayName", "avatar"],
          required: false,
        },
      ],
      limit: pageSize,
      offset,
    });

    return {
      tasks: rows,
      pagination: {
        total: count,
        page,
        pageSize,
      },
    };
  }

  /**
   * 更新任务
   */
  static async update(uuid: string, data: UpdateTaskData) {
    const [affectedCount] = await Conversation.update(data, {
      where: { uuid },
    });
    if (affectedCount === 0) {
      return null;
    }
    return await this.findByUuid(uuid);
  }

  /**
   * 更新任务状态
   */
  static async updateStatus(uuid: string, status: TaskStatus) {
    return await this.update(uuid, { status });
  }

  /**
   * 删除任务（级联删除关联消息）
   */
  static async delete(uuid: string) {
    // 先查询任务获取 id
    const task = await this.findByUuid(uuid);
    if (!task) {
      return false;
    }

    // 删除关联的消息
    await Message.destroy({ where: { conversationId: task.id } });

    // 删除任务
    await Conversation.destroy({ where: { uuid } });

    return true;
  }

  /**
   * 检查任务是否属于指定用户
   */
  static async belongsToUser(uuid: string, userId: number): Promise<boolean> {
    const task = await this.findByUuid(uuid);
    return task !== null && task.userId === userId;
  }
}

export default TaskDAO;
