/**
 * Forge 服务
 * 处理 Forge（Agent）相关的业务逻辑
 */
import { randomUUID } from "crypto";
import ForgeDAO from "../dao/forgeDAO.js";
import ForgeFavoriteDAO from "../dao/forgeFavoriteDAO.js";
import McpForgeDAO, { type McpToolAssociation } from "../dao/mcpForgeDAO.js";
import TaskService from "./taskService.js";
import type { JwtPayload } from "../middleware/tokenAuth.js";
import type { ToolInfo } from "../dao/models/McpForge.js";

// Forge 筛选类型
type ForgeFilter = "all" | "my" | "builtin" | "other";

// MCP 工具选择参数（前端传入）
export interface McpToolSelection {
  mcpId: number;
  tools: ToolInfo[];
}

// 创建 Forge 参数
interface CreateForgeParams {
  displayName: string;
  description?: string;
  systemPrompt?: string;
  avatar?: string;
  isPublic?: boolean;
  mcpIds?: number[]; // 兼容旧接口
  mcpTools?: McpToolSelection[]; // 新接口：MCP 工具选择
}

// 更新 Forge 参数
interface UpdateForgeParams {
  displayName?: string;
  description?: string;
  systemPrompt?: string;
  avatar?: string;
  isPublic?: boolean;
  mcpIds?: number[]; // 兼容旧接口
  mcpTools?: McpToolSelection[]; // 新接口：MCP 工具选择
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
   * 返回额外的权限信息：isOwner, canEdit，以及关联的 MCP 和工具列表
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

    // 获取关联的 MCP 和工具列表
    const mcpAssociations = await McpForgeDAO.findByForgeId(id);
    const mcpIds = mcpAssociations.map((a) => a.mcpId);
    // 返回完整的 MCP 工具关联信息
    const mcpTools: McpToolSelection[] = mcpAssociations.map((a) => ({
      mcpId: a.mcpId,
      tools: a.tools || [],
    }));

    return {
      ...forge,
      isOwner,
      canEdit,
      mcpIds, // 兼容旧接口
      mcpTools, // 新接口：包含工具信息
    };
  }

  // 默认头像数量
  static DEFAULT_AVATAR_COUNT = 7;

  /**
   * 获取随机默认头像 URL
   */
  static getRandomDefaultAvatar(): string {
    const index = Math.floor(Math.random() * this.DEFAULT_AVATAR_COUNT) + 1;
    return `/api/defaultImgs/default-${index}.png`;
  }

  /**
   * 创建 Forge
   * root 用户创建的为内置 Forge
   * 如果没有头像，随机分配一个默认头像
   */
  static async createForge(params: CreateForgeParams, user: JwtPayload) {
    // 根据用户角色决定 source
    const source = user.role === "root" ? "builtin" : "user";

    // 如果没有头像，随机分配默认头像
    const avatar = params.avatar || this.getRandomDefaultAvatar();

    // 提取 mcpIds 和 mcpTools，不传给 ForgeDAO
    const { mcpIds, mcpTools, ...forgeParams } = params;

    const forge = await ForgeDAO.create({
      ...forgeParams,
      avatar,
      userId: user.id,
      source,
    });

    // 创建 MCP 工具关联（优先使用 mcpTools，兼容旧的 mcpIds）
    if (mcpTools && mcpTools.length > 0) {
      // 新接口：带工具信息
      const associations: McpToolAssociation[] = mcpTools.map((mt) => ({
        mcpId: mt.mcpId,
        tools: mt.tools,
      }));
      await McpForgeDAO.bulkCreateWithTools(associations, forge.id);
    } else if (mcpIds && mcpIds.length > 0) {
      // 兼容旧接口：只有 MCP ID，没有工具信息
      await McpForgeDAO.bulkCreate(mcpIds, forge.id);
    }

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

    // 提取 mcpIds 和 mcpTools，不传给 ForgeDAO
    const { mcpIds, mcpTools, ...forgeParams } = params;

    // 更新 Forge 基本信息
    await ForgeDAO.update(id, forgeParams);

    // 更新 MCP 工具关联（优先使用 mcpTools，兼容旧的 mcpIds）
    if (mcpTools !== undefined) {
      // 新接口：带工具信息
      const associations: McpToolAssociation[] = mcpTools.map((mt) => ({
        mcpId: mt.mcpId,
        tools: mt.tools,
      }));
      await McpForgeDAO.updateForgeToolAssociations(id, associations);
    } else if (mcpIds !== undefined) {
      // 兼容旧接口：只有 MCP ID，没有工具信息
      await McpForgeDAO.updateForgeAssociations(id, mcpIds);
    }

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
