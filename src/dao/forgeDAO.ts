/**
 * Forge（Agent）数据访问层
 */
import { Op } from "sequelize";
import { Agent, User, ForgeFavorite } from "./models/index.js";

// Forge 筛选类型
type ForgeFilter = "all" | "my" | "builtin" | "other";

// 创建 Forge 参数
interface CreateForgeParams {
  displayName: string;
  description?: string;
  systemPrompt?: string;
  avatar?: string;
  isPublic?: boolean;
  userId: number;
  source: "builtin" | "user";
}

// 更新 Forge 参数
interface UpdateForgeParams {
  displayName?: string;
  description?: string;
  systemPrompt?: string;
  avatar?: string;
  isPublic?: boolean;
  isActive?: boolean;
}

class ForgeDAO {
  /**
   * 获取 Forge 列表
   * @param filter 筛选类型：all 全部公开 / my 我的 / builtin 内置 / other 其他用户
   * @param userId 当前用户 ID（用于 my/other 筛选和判断收藏状态）
   */
  static async findAll(filter: ForgeFilter, userId?: number) {
    const where: Record<string, unknown> = { isActive: true };

    switch (filter) {
      case "all":
        // 所有公开的 Forge + 自己创建的非公开 Forge
        if (userId) {
          where[Op.or as unknown as string] = [{ isPublic: true }, { userId }];
        } else {
          where.isPublic = true;
        }
        break;
      case "my":
        // 当前用户创建的 Forge
        if (!userId) throw new Error("userId is required for 'my' filter");
        where.userId = userId;
        break;
      case "builtin":
        // 内置 Forge（公开的 + 自己创建的）
        where.source = "builtin";
        if (userId) {
          where[Op.or as unknown as string] = [{ isPublic: true }, { userId }];
        } else {
          where.isPublic = true;
        }
        break;
      case "other":
        // 其他用户创建的公开 Forge（非内置、非自己的）
        if (!userId) throw new Error("userId is required for 'other' filter");
        where.isPublic = true;
        where.source = "user";
        where.userId = { [Op.ne]: userId };
        break;
    }

    const forges = await Agent.findAll({
      where,
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "username"],
        },
      ],
      order: [["usageCount", "DESC"]],
    });

    // 如果有 userId，查询收藏状态并添加 isOwner 字段
    if (userId) {
      const favoriteForgeIds = await ForgeFavorite.findAll({
        where: { userId },
        attributes: ["forgeId"],
      }).then((favorites) => favorites.map((f) => f.forgeId));

      return forges.map((forge) => ({
        ...forge.toJSON(),
        isFavorite: favoriteForgeIds.includes(forge.id),
        isOwner: forge.userId === userId,
      }));
    }

    return forges.map((forge) => ({
      ...forge.toJSON(),
      isFavorite: false,
      isOwner: false,
    }));
  }

  /**
   * 根据 ID 获取 Forge 详情
   */
  static async findById(id: number, userId?: number) {
    const forge = await Agent.findByPk(id, {
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "username"],
        },
      ],
    });

    if (!forge) return null;

    // 判断收藏状态
    let isFavorite = false;
    if (userId) {
      const favorite = await ForgeFavorite.findOne({
        where: { userId, forgeId: id },
      });
      isFavorite = !!favorite;
    }

    return {
      ...forge.toJSON(),
      isFavorite,
    };
  }

  /**
   * 创建 Forge
   */
  static async create(params: CreateForgeParams) {
    return Agent.create(params);
  }

  /**
   * 更新 Forge
   */
  static async update(id: number, params: UpdateForgeParams) {
    const [affectedCount] = await Agent.update(params, { where: { id } });
    return affectedCount > 0;
  }

  /**
   * 删除 Forge（软删除，设置 isActive = false）
   */
  static async delete(id: number) {
    const [affectedCount] = await Agent.update({ isActive: false }, { where: { id } });
    return affectedCount > 0;
  }

  /**
   * 增加使用次数
   */
  static async incrementUsageCount(id: number) {
    await Agent.increment("usageCount", { where: { id } });
  }

  /**
   * 检查 Forge 是否存在
   */
  static async exists(id: number) {
    const count = await Agent.count({ where: { id, isActive: true } });
    return count > 0;
  }

  /**
   * 更新 Forge 摘要
   * @param id Forge ID
   * @param summary 摘要内容
   */
  static async updateSummary(id: number, summary: string) {
    const [affectedCount] = await Agent.update({ summary }, { where: { id } });
    return affectedCount > 0;
  }

  /**
   * 获取所有公开 Forge 的摘要列表（用于意图分析）
   * @param userId 当前用户 ID（可选，用于包含用户自己的非公开 Forge）
   */
  static async getAllSummaries(userId?: number) {
    const where: Record<string, unknown> = { isActive: true };

    if (userId) {
      where[Op.or as unknown as string] = [{ isPublic: true }, { userId }];
    } else {
      where.isPublic = true;
    }

    const forges = await Agent.findAll({
      where,
      attributes: ["id", "displayName", "summary"],
    });

    return forges.map((forge) => ({
      id: forge.id,
      name: forge.displayName,
      summary: forge.summary || "",
    }));
  }
}

export default ForgeDAO;
