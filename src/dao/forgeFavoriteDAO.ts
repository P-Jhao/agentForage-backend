/**
 * Forge 收藏数据访问层
 */
import { ForgeFavorite, Agent } from "./models/index.js";

class ForgeFavoriteDAO {
  /**
   * 获取用户收藏的 Forge 列表
   */
  static async findByUserId(userId: number) {
    const favorites = await ForgeFavorite.findAll({
      where: { userId },
      include: [
        {
          model: Agent,
          as: "forge",
          where: { isActive: true },
          attributes: ["id", "name", "displayName", "avatar", "description", "usageCount"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // 返回 Forge 列表（从关联中提取）
    return favorites.map((f) => (f as unknown as { forge: typeof Agent.prototype }).forge);
  }

  /**
   * 添加收藏
   */
  static async create(userId: number, forgeId: number) {
    // 使用 findOrCreate 避免重复收藏
    const [favorite, created] = await ForgeFavorite.findOrCreate({
      where: { userId, forgeId },
      defaults: { userId, forgeId },
    });
    return { favorite, created };
  }

  /**
   * 取消收藏
   */
  static async delete(userId: number, forgeId: number) {
    const deletedCount = await ForgeFavorite.destroy({
      where: { userId, forgeId },
    });
    return deletedCount > 0;
  }

  /**
   * 检查是否已收藏
   */
  static async isFavorite(userId: number, forgeId: number) {
    const count = await ForgeFavorite.count({
      where: { userId, forgeId },
    });
    return count > 0;
  }

  /**
   * 获取 Forge 的收藏数量
   */
  static async countByForgeId(forgeId: number) {
    return ForgeFavorite.count({ where: { forgeId } });
  }
}

export default ForgeFavoriteDAO;
