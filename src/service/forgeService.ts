/**
 * Forge 服务
 * 处理 Forge（Agent）相关的业务逻辑
 */
import { randomUUID } from "crypto";
import ForgeDAO from "../dao/forgeDAO.js";
import ForgeFavoriteDAO from "../dao/forgeFavoriteDAO.js";
import TaskService from "./taskService.js";
import type { JwtPayload } from "../middleware/tokenAuth.js";

// Forge 筛选类型
type ForgeFilter = "all" | "my" | "builtin" | "other";

// 创建 Forge 参数
interface CreateForgeParams {
  displayName: string;
  description?: string;
  systemPrompt?: string;
  avatar?: string;
  isPublic?: boolean;
}

// 更新 Forge 参数
interface UpdateForgeParams {
  displayName?: string;
  description?: string;
  systemPrompt?: string;
  avatar?: string;
  isPublic?: boolean;
}

class ForgeService {
  /**
   * 获取 Forge 列表
   */
  static async getForgeList(filter: ForgeFilter, userId?: number) {
    return ForgeDAO.findAll(filter, userId);
  }

  /**
   * 获取用户收藏的 Forge 列表（侧边栏用）
   */
  static async getFavoriteForges(userId: number) {
    return ForgeFavoriteDAO.findByUserId(userId);
  }

  /**
   * 获取 Forge 详情
   * 返回额外的权限信息：isOwner, canEdit
   */
  static async getForgeById(id: number, user?: JwtPayload) {
    const forge = await ForgeDAO.findById(id, user?.id);

    if (!forge) {
      throw Object.assign(new Error("Forge 不存在"), { status: 404 });
    }

    // 判断权限
    const isOwner = user ? forge.userId === user.id : false;
    const isRoot = user?.role === "root";
    // root 用户可以编辑所有，普通用户只能编辑自己创建的非内置 Forge
    const canEdit = isRoot || (isOwner && forge.source === "user");

    return {
      ...forge,
      isOwner,
      canEdit,
    };
  }

  /**
   * 创建 Forge
   * root 用户创建的为内置 Forge
   */
  static async createForge(params: CreateForgeParams, user: JwtPayload) {
    // 根据用户角色决定 source
    const source = user.role === "root" ? "builtin" : "user";

    const forge = await ForgeDAO.create({
      ...params,
      userId: user.id,
      source,
    });

    return { id: forge.id };
  }

  /**
   * 更新 Forge
   * 权限检查：普通用户只能更新自己创建的非内置 Forge，root 可以更新所有
   */
  static async updateForge(id: number, params: UpdateForgeParams, user: JwtPayload) {
    const forge = await ForgeDAO.findById(id);

    if (!forge) {
      throw Object.assign(new Error("Forge 不存在"), { status: 404 });
    }

    // 权限检查
    const isOwner = forge.userId === user.id;
    const isRoot = user.role === "root";
    const canEdit = isRoot || (isOwner && forge.source === "user");

    if (!canEdit) {
      throw Object.assign(new Error("无权限编辑此 Forge"), { status: 403 });
    }

    await ForgeDAO.update(id, params);
    return { success: true };
  }

  /**
   * 删除 Forge
   * 权限检查：普通用户只能删除自己创建的非内置 Forge，root 可以删除所有
   */
  static async deleteForge(id: number, user: JwtPayload) {
    const forge = await ForgeDAO.findById(id);

    if (!forge) {
      throw Object.assign(new Error("Forge 不存在"), { status: 404 });
    }

    // 权限检查
    const isOwner = forge.userId === user.id;
    const isRoot = user.role === "root";
    const canDelete = isRoot || (isOwner && forge.source === "user");

    if (!canDelete) {
      throw Object.assign(new Error("无权限删除此 Forge"), { status: 403 });
    }

    await ForgeDAO.delete(id);
    return { success: true };
  }

  /**
   * 收藏/取消收藏 Forge
   */
  static async toggleFavorite(forgeId: number, userId: number, favorite: boolean) {
    // 检查 Forge 是否存在
    const exists = await ForgeDAO.exists(forgeId);
    if (!exists) {
      throw Object.assign(new Error("Forge 不存在"), { status: 404 });
    }

    if (favorite) {
      await ForgeFavoriteDAO.create(userId, forgeId);
    } else {
      await ForgeFavoriteDAO.delete(userId, forgeId);
    }

    return { success: true, favorite };
  }

  /**
   * 从 Forge 创建任务
   * 1. 增加 Forge 使用次数
   * 2. 创建任务
   * 3. 返回任务 UUID 和 Forge 信息
   */
  static async createTaskFromForge(forgeId: number, message: string, userId: number) {
    // 获取 Forge 信息
    const forge = await ForgeDAO.findById(forgeId);

    if (!forge) {
      throw Object.assign(new Error("Forge 不存在"), { status: 404 });
    }

    // 增加使用次数
    await ForgeDAO.incrementUsageCount(forgeId);

    // 生成任务 UUID
    const taskUuid = randomUUID();

    // 创建任务
    await TaskService.createTask(userId, {
      uuid: taskUuid,
      agentId: forgeId,
      firstMessage: message,
    });

    return {
      taskUuid,
      forge: {
        id: forge.id,
        systemPrompt: forge.systemPrompt,
      },
    };
  }
}

export default ForgeService;
