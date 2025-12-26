/**
 * 推荐示例服务
 * 处理推荐示例的业务逻辑
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FeaturedTask, Conversation, Agent } from "../dao/models/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 图片上传目录
const imageUploadDir = path.join(__dirname, "../../public/uploads/images");

// 推荐示例列表项（包含任务信息）
export interface FeaturedTaskItem {
  id: number;
  taskUuid: string;
  coverImage: string | null;
  title: string;
  description: string | null;
  clonePrompt: string | null;
  // 一键做同款时的设置选项
  enableThinking: boolean;
  enhanceMode: string;
  smartRoutingEnabled: boolean;
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
  enableThinking?: boolean;
  enhanceMode?: string;
  smartRoutingEnabled?: boolean;
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
        enableThinking: plain.enableThinking,
        enhanceMode: plain.enhanceMode,
        smartRoutingEnabled: plain.smartRoutingEnabled,
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
   * 更新时如果更换了封面图，会删除旧的封面图文件
   */
  async setFeatured(params: SetFeaturedParams): Promise<FeaturedTask> {
    const {
      taskUuid,
      coverImage,
      title,
      description,
      clonePrompt,
      enableThinking,
      enhanceMode,
      smartRoutingEnabled,
      sortOrder,
    } = params;

    // 检查任务是否存在
    const task = await Conversation.findOne({ where: { uuid: taskUuid } });
    if (!task) {
      throw new Error("任务不存在");
    }

    // 查找是否已存在
    const existing = await FeaturedTask.findOne({ where: { taskUuid } });

    if (existing) {
      // 如果更换了封面图，删除旧的封面图文件
      if (coverImage !== undefined && coverImage !== existing.coverImage && existing.coverImage) {
        try {
          const filename = path.basename(existing.coverImage);
          const filePath = path.join(imageUploadDir, filename);
          const normalizedPath = path.normalize(filePath);
          if (normalizedPath.startsWith(path.normalize(imageUploadDir))) {
            if (fs.existsSync(filePath)) {
              await fs.promises.unlink(filePath);
              console.log(`[FeaturedTaskService] 已删除旧封面图: ${filePath}`);
            }
          }
        } catch (error) {
          console.error(`[FeaturedTaskService] 删除旧封面图失败:`, error);
        }
      }

      // 更新
      await existing.update({
        coverImage: coverImage !== undefined ? coverImage : existing.coverImage,
        title: title !== undefined ? title : existing.title,
        description: description !== undefined ? description : existing.description,
        clonePrompt: clonePrompt !== undefined ? clonePrompt : existing.clonePrompt,
        enableThinking: enableThinking !== undefined ? enableThinking : existing.enableThinking,
        enhanceMode: enhanceMode !== undefined ? enhanceMode : existing.enhanceMode,
        smartRoutingEnabled:
          smartRoutingEnabled !== undefined ? smartRoutingEnabled : existing.smartRoutingEnabled,
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
      enableThinking: enableThinking ?? false,
      enhanceMode: enhanceMode || "off",
      smartRoutingEnabled: smartRoutingEnabled ?? false,
      sortOrder: sortOrder || 0,
    });
  }

  /**
   * 取消推荐示例
   * 同时删除关联的封面图文件
   */
  async removeFeatured(taskUuid: string): Promise<boolean> {
    // 先获取推荐示例信息，用于删除封面图
    const featured = await FeaturedTask.findOne({ where: { taskUuid } });
    if (!featured) {
      return false;
    }

    // 删除封面图文件
    if (featured.coverImage) {
      try {
        // coverImage 格式为 /uploads/images/xxx.png，提取文件名
        const filename = path.basename(featured.coverImage);
        const filePath = path.join(imageUploadDir, filename);

        // 安全检查：确保文件在 images 目录内
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.startsWith(path.normalize(imageUploadDir))) {
          if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            console.log(`[FeaturedTaskService] 已删除封面图: ${filePath}`);
          }
        }
      } catch (error) {
        console.error(`[FeaturedTaskService] 删除封面图失败:`, error);
        // 不影响主流程，继续删除数据库记录
      }
    }

    // 删除数据库记录
    const result = await FeaturedTask.destroy({ where: { taskUuid } });
    return result > 0;
  }
}

export default new FeaturedTaskService();
