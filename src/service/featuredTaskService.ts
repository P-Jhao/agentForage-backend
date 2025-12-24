/**
 * 推荐示例服务
 * 处理推荐示例的业务逻辑
 */
import { FeaturedTask, Conversation, Agent } from "../dao/models/index.js";

// 推荐示例列表项（包含任务信息）
export interface FeaturedTaskItem {
  id: number;
  taskUuid: string;
  coverImage: string | null;
  title: string;
  description: string | null;
  clonePrompt: string | null;
  sortOrder: number;
  createdAt: Date;
  // 关联的任务信息
  task: {
    uuid: string;
    title: string;
    status: string;
    agent: {
      id: number;
      displayName: string;
      avatar: string | null;
    } | null;
  } | null;
}

// 设置推荐示例参数
interface SetFeaturedParams {
  taskUuid: string;
  coverImage?: string;
  title?: string;
  description?: string;
  clonePrompt?: string;
  sortOrder?: number;
}

class FeaturedTaskService {
  /**
   * 获取推荐示例列表
   */
  async getList(): Promise<FeaturedTaskItem[]> {
    const list = await FeaturedTask.findAll({
      order: [
        ["sortOrder", "DESC"],
        ["createdAt", "DESC"],
      ],
      include: [
        {
          model: Conversation,
          as: "task",
          attributes: ["uuid", "title", "status"],
          include: [
            {
              model: Agent,
              as: "agent",
              attributes: ["id", "displayName", "avatar"],
            },
          ],
        },
      ],
    });

    return list.map((item) => {
      const plain = item.get({ plain: true }) as FeaturedTask & {
        task?: {
          uuid: string;
          title: string;
          status: string;
          agent?: { id: number; displayName: string; avatar: string | null };
        };
      };
      return {
        id: plain.id,
        taskUuid: plain.taskUuid,
        coverImage: plain.coverImage,
        // 优先使用自定义标题，否则使用任务原标题
        title: plain.title || plain.task?.title || "未命名任务",
        description: plain.description,
        clonePrompt: plain.clonePrompt,
        sortOrder: plain.sortOrder,
        createdAt: item.createdAt,
        task: plain.task
          ? {
              uuid: plain.task.uuid,
              title: plain.task.title,
              status: plain.task.status,
              agent: plain.task.agent || null,
            }
          : null,
      };
    });
  }

  /**
   * 根据任务 UUID 获取推荐示例
   */
  async getByTaskUuid(taskUuid: string): Promise<FeaturedTask | null> {
    return FeaturedTask.findOne({ where: { taskUuid } });
  }

  /**
   * 设置推荐示例（创建或更新）
   */
  async setFeatured(params: SetFeaturedParams): Promise<FeaturedTask> {
    const { taskUuid, coverImage, title, description, clonePrompt, sortOrder } = params;

    // 检查任务是否存在
    const task = await Conversation.findOne({ where: { uuid: taskUuid } });
    if (!task) {
      throw new Error("任务不存在");
    }

    // 查找是否已存在
    const existing = await FeaturedTask.findOne({ where: { taskUuid } });

    if (existing) {
      // 更新
      await existing.update({
        coverImage: coverImage !== undefined ? coverImage : existing.coverImage,
        title: title !== undefined ? title : existing.title,
        description: description !== undefined ? description : existing.description,
        clonePrompt: clonePrompt !== undefined ? clonePrompt : existing.clonePrompt,
        sortOrder: sortOrder !== undefined ? sortOrder : existing.sortOrder,
      });
      return existing;
    }

    // 创建
    return FeaturedTask.create({
      taskUuid,
      coverImage: coverImage || null,
      title: title || null,
      description: description || null,
      clonePrompt: clonePrompt || null,
      sortOrder: sortOrder || 0,
    });
  }

  /**
   * 取消推荐示例
   */
  async removeFeatured(taskUuid: string): Promise<boolean> {
    const result = await FeaturedTask.destroy({ where: { taskUuid } });
    return result > 0;
  }
}

export default new FeaturedTaskService();
