/**
 * Forge 服务
 * 处理 Forge（Agent）相关的业务逻辑
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import ForgeDAO from "../dao/forgeDAO.js";
import ForgeFavoriteDAO from "../dao/forgeFavoriteDAO.js";
import McpForgeDAO, { type McpToolAssociation } from "../dao/mcpForgeDAO.js";
import TaskService from "./taskService.js";
import type { JwtPayload } from "../middleware/tokenAuth.js";
import type { ToolInfo } from "../dao/models/McpForge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 头像上传目录
const avatarUploadDir = path.join(__dirname, "../../public/uploads/avatars");

// 动态导入 Gateway（用于摘要生成）
const loadGateway = async () => {
  return await import("agentforge-gateway");
};

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
   * 异步生成 Forge 摘要（不阻塞主流程）
   * 在 Forge 创建或更新后调用，后台生成摘要并更新数据库
   * @param forgeId Forge ID
   * @param mcpTools MCP 工具列表
   */
  static async triggerSummaryGeneration(
    forgeId: number,
    mcpTools: McpToolSelection[]
  ): Promise<void> {
    // 如果没有 MCP 工具，不生成摘要
    if (!mcpTools || mcpTools.length === 0) {
      return;
    }

    // 异步执行，不阻塞主流程
    setImmediate(async () => {
      try {
        const gateway = await loadGateway();

        // 将 MCP 工具转换为 Gateway 需要的格式
        const tools = mcpTools.flatMap((mt) =>
          mt.tools.map((t) => ({
            name: t.name,
            description: t.description || "",
          }))
        );

        // 调用 Gateway 生成摘要
        const summary = await gateway.generateForgeSummary({ mcpTools: tools });

        // 更新数据库
        await ForgeDAO.updateSummary(forgeId, summary);
      } catch (error) {
        // 摘要生成失败不影响主流程，仅记录日志
        console.error(`[ForgeService] 摘要生成失败 (forgeId: ${forgeId}):`, error);
      }
    });
  }

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
   * 判断是否为用户上传的头像（非默认头像）
   */
  static isUploadedAvatar(avatar: string | null): boolean {
    if (!avatar) return false;
    // 用户上传的头像路径包含 /uploads/avatars/
    return avatar.includes("/uploads/avatars/");
  }

  /**
   * 删除用户上传的头像文件
   * 只删除 uploads/avatars 目录下的文件，默认头像不处理
   */
  static async deleteAvatarFile(avatar: string | null): Promise<void> {
    if (!avatar || !this.isUploadedAvatar(avatar)) {
      return;
    }

    try {
      // 提取文件名（avatar 格式为 /api/uploads/avatars/xxx.png）
      const filename = path.basename(avatar);
      const filePath = path.join(avatarUploadDir, filename);

      // 安全检查：确保文件在 avatars 目录内
      const normalizedPath = path.normalize(filePath);
      if (!normalizedPath.startsWith(path.normalize(avatarUploadDir))) {
        console.warn(`[ForgeService] 跳过非法头像路径: ${avatar}`);
        return;
      }

      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log(`[ForgeService] 已删除头像文件: ${filePath}`);
      }
    } catch (error) {
      console.error(`[ForgeService] 删除头像文件失败:`, error);
    }
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

      // 异步触发摘要生成（不阻塞返回）
      this.triggerSummaryGeneration(forge.id, mcpTools);
    } else if (mcpIds && mcpIds.length > 0) {
      // 兼容旧接口：只有 MCP ID，没有工具信息
      await McpForgeDAO.bulkCreate(mcpIds, forge.id);
    }

    return { id: forge.id };
  }

  /**
   * 更新 Forge
   * 权限检查：普通用户只能更新自己创建的非内置 Forge，root 可以更新所有
   * 如果更换了头像，会删除旧的用户上传头像文件
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

    // 如果更换了头像，删除旧的用户上传头像文件
    if (forgeParams.avatar !== undefined && forgeParams.avatar !== forge.avatar) {
      await this.deleteAvatarFile(forge.avatar);
    }

    // 更新 Forge 基本信息
    await ForgeDAO.update(id, forgeParams);

    // 更新 MCP 工具关联（优先使用 mcpTools，兼容旧的 mcpIds）
    if (mcpTools !== undefined) {
      // 获取当前的 MCP 工具关联，用于比较是否有变化
      const currentAssociations = await McpForgeDAO.findByForgeId(id);
      const mcpToolsChanged = this.hasMcpToolsChanged(currentAssociations, mcpTools);

      // 新接口：带工具信息
      const associations: McpToolAssociation[] = mcpTools.map((mt) => ({
        mcpId: mt.mcpId,
        tools: mt.tools,
      }));
      await McpForgeDAO.updateForgeToolAssociations(id, associations);

      // 只有 MCP 工具发生变化时才重新生成摘要
      if (mcpToolsChanged) {
        this.triggerSummaryGeneration(id, mcpTools);
      }
    } else if (mcpIds !== undefined) {
      // 兼容旧接口：只有 MCP ID，没有工具信息
      await McpForgeDAO.updateForgeAssociations(id, mcpIds);
    }

    return { success: true };
  }

  /**
   * 比较 MCP 工具是否发生变化
   * @param currentAssociations 当前的 MCP 关联
   * @param newMcpTools 新的 MCP 工具列表
   * @returns 是否有变化
   */
  private static hasMcpToolsChanged(
    currentAssociations: Array<{ mcpId: number; tools: ToolInfo[] }>,
    newMcpTools: McpToolSelection[]
  ): boolean {
    // 构建当前工具的标识集合：mcpId_toolName
    const currentToolSet = new Set<string>();
    for (const assoc of currentAssociations) {
      for (const tool of assoc.tools) {
        currentToolSet.add(`${assoc.mcpId}_${tool.name}`);
      }
    }

    // 构建新工具的标识集合
    const newToolSet = new Set<string>();
    for (const mt of newMcpTools) {
      for (const tool of mt.tools) {
        newToolSet.add(`${mt.mcpId}_${tool.name}`);
      }
    }

    // 比较两个集合是否相同
    if (currentToolSet.size !== newToolSet.size) {
      return true;
    }

    for (const toolId of currentToolSet) {
      if (!newToolSet.has(toolId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 删除 Forge
   * 权限检查：普通用户只能删除自己创建的非内置 Forge，root 可以删除所有
   * 同时删除关联的用户上传头像文件
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

    // 删除用户上传的头像文件
    await this.deleteAvatarFile(forge.avatar);

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

  /**
   * 获取所有 Forge 摘要列表（用于意图分析）
   * @param userId 当前用户 ID（可选，用于包含用户自己的非公开 Forge）
   */
  static async getAllForgeSummaries(userId?: number) {
    return ForgeDAO.getAllSummaries(userId);
  }
}

export default ForgeService;
