/**
 * 用户数据访问对象
 */
import { Op } from "sequelize";
import { User, Conversation, Message } from "./models/index.js";
import type { CustomModelConfig } from "./models/User.js";
import CryptoService from "../service/cryptoService.js";

interface CreateUserData {
  username: string;
  nickname: string;
  password: string;
}

// 用户资料更新数据
interface UpdateProfileData {
  nickname?: string;
  avatar?: string | null;
  email?: string | null;
}

// 成员列表查询参数
interface MemberListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  role?: "all" | "user" | "premium" | "root" | "operator";
  status?: "all" | "active" | "deleted";
}

// 成员列表项
interface MemberListItem {
  id: number;
  username: string;
  nickname: string;
  avatar: string | null;
  email: string | null;
  role: "user" | "premium" | "root" | "operator";
  adminNote: string | null;
  isDeleted: boolean;
  taskCount: number;
  totalTokens: number;
  createdAt: Date;
  lastLoginAt: Date | null;
}

// 成员更新数据
interface UpdateMemberData {
  username?: string;
  email?: string | null;
  role?: "user" | "premium" | "root" | "operator";
  adminNote?: string | null;
}

class UserDAO {
  static async create(userData: CreateUserData) {
    return await User.create(userData);
  }

  static async findById(id: number) {
    return await User.findByPk(id);
  }

  static async findByUsername(username: string) {
    return await User.findOne({ where: { username } });
  }

  static async updateById(id: number, data: Partial<CreateUserData>) {
    return await User.update(data, { where: { id } });
  }

  /**
   * 更新用户资料（头像、邮箱等）
   */
  static async updateProfile(userId: number, data: UpdateProfileData): Promise<boolean> {
    const [affectedRows] = await User.update(data, { where: { id: userId } });
    return affectedRows > 0;
  }

  /**
   * 更新用户密码
   */
  static async updatePassword(userId: number, hashedPassword: string): Promise<boolean> {
    const [affectedRows] = await User.update(
      { password: hashedPassword },
      { where: { id: userId } }
    );
    return affectedRows > 0;
  }

  /**
   * 获取用户的模型配置
   * 自动解密 apiKey
   */
  static async getModelConfig(userId: number): Promise<CustomModelConfig | null> {
    const user = await User.findByPk(userId, {
      attributes: ["modelConfig"],
    });
    const config = user?.modelConfig;
    if (!config) return null;

    // 如果有加密的 apiKey，解密后返回
    if (config.apiKey && config.mode === "custom") {
      try {
        config.apiKey = CryptoService.aesDecrypt(config.apiKey);
      } catch (error) {
        console.error("[UserDAO] 解密 apiKey 失败:", error);
        // 解密失败时返回空，避免泄露加密数据
        config.apiKey = "";
      }
    }

    return config;
  }

  /**
   * 更新用户的模型配置
   * 自动加密 apiKey 后存储
   */
  static async updateModelConfig(userId: number, config: CustomModelConfig): Promise<boolean> {
    // 如果有 apiKey，加密后存储
    const configToSave = { ...config };
    if (configToSave.apiKey && configToSave.mode === "custom") {
      try {
        configToSave.apiKey = CryptoService.aesEncrypt(configToSave.apiKey);
      } catch (error) {
        console.error("[UserDAO] 加密 apiKey 失败:", error);
        throw new Error("加密 apiKey 失败");
      }
    }

    const [affectedRows] = await User.update(
      { modelConfig: configToSave },
      { where: { id: userId } }
    );
    return affectedRows > 0;
  }

  /**
   * 更新最近登录时间
   */
  static async updateLastLoginAt(userId: number): Promise<boolean> {
    const [affectedRows] = await User.update(
      { lastLoginAt: new Date() },
      { where: { id: userId } }
    );
    return affectedRows > 0;
  }

  /**
   * 获取成员列表（管理员用）
   */
  static async getMemberList(
    params: MemberListParams
  ): Promise<{ members: MemberListItem[]; total: number }> {
    const { page, pageSize, keyword, role, status } = params;
    const offset = (page - 1) * pageSize;

    // 构建查询条件
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    // 关键词搜索（用户名或昵称）
    if (keyword) {
      where[Op.or] = [
        { username: { [Op.like]: `%${keyword}%` } },
        { nickname: { [Op.like]: `%${keyword}%` } },
      ];
    }

    // 角色筛选
    if (role && role !== "all") {
      where.role = role;
    }

    // 状态筛选
    if (status === "active") {
      where.isDeleted = false;
    } else if (status === "deleted") {
      where.isDeleted = true;
    }

    // 查询用户列表
    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: [
        "id",
        "username",
        "nickname",
        "avatar",
        "email",
        "role",
        "adminNote",
        "isDeleted",
        "createdAt",
        "lastLoginAt",
      ],
      order: [["createdAt", "DESC"]],
      limit: pageSize,
      offset,
    });

    // 获取每个用户的任务数量和 token 消耗
    const userIds = users.map((u) => u.id);
    const taskCountMap = new Map<number, number>();
    const tokenMap = new Map<number, number>();

    if (userIds.length > 0) {
      // 查询每个用户的任务数量
      const taskCounts = (await Conversation.findAll({
        where: { userId: { [Op.in]: userIds } },
        attributes: ["userId", [User.sequelize!.fn("COUNT", User.sequelize!.col("id")), "count"]],
        group: ["userId"],
        raw: true,
      })) as unknown as Array<{ userId: number; count: string }>;

      for (const tc of taskCounts) {
        taskCountMap.set(tc.userId, parseInt(tc.count, 10));
      }

      // 查询每个用户的累积 token 消耗
      // 先获取所有用户的任务 ID
      const userConversations = await Conversation.findAll({
        where: { userId: { [Op.in]: userIds } },
        attributes: ["id", "userId"],
        raw: true,
      });

      const convIdToUserId = new Map<number, number>();
      for (const conv of userConversations) {
        convIdToUserId.set(conv.id, conv.userId);
      }

      const convIds = Array.from(convIdToUserId.keys());
      if (convIds.length > 0) {
        // 查询每个任务最后一条 turn_end 消息的累积 token
        const turnEndMessages = await Message.findAll({
          where: {
            conversationId: { [Op.in]: convIds },
            type: "turn_end",
          },
          attributes: ["conversationId", "content"],
          order: [["createdAt", "DESC"]],
          raw: true,
        });

        // 按任务分组，取最新的 turn_end 消息
        const latestTurnEnd = new Map<number, string>();
        for (const msg of turnEndMessages) {
          if (!latestTurnEnd.has(msg.conversationId)) {
            latestTurnEnd.set(msg.conversationId, msg.content);
          }
        }

        // 解析 token 数量并按用户汇总
        for (const [convId, content] of latestTurnEnd) {
          const userId = convIdToUserId.get(convId);
          if (!userId) continue;

          try {
            const data = JSON.parse(content);
            const tokens = data.accumulatedTokens?.totalTokens || 0;
            tokenMap.set(userId, (tokenMap.get(userId) || 0) + tokens);
          } catch {
            // 解析失败忽略
          }
        }
      }
    }

    // 构建返回数据
    const members: MemberListItem[] = users.map((user) => ({
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      role: user.role,
      adminNote: user.adminNote,
      isDeleted: user.isDeleted,
      taskCount: taskCountMap.get(user.id) || 0,
      totalTokens: tokenMap.get(user.id) || 0,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }));

    return { members, total: count };
  }

  /**
   * 更新成员信息（管理员用）
   */
  static async updateMember(userId: number, data: UpdateMemberData): Promise<boolean> {
    const [affectedRows] = await User.update(data, { where: { id: userId } });
    return affectedRows > 0;
  }

  /**
   * 软删除成员
   */
  static async softDeleteMember(userId: number): Promise<boolean> {
    const [affectedRows] = await User.update({ isDeleted: true }, { where: { id: userId } });
    return affectedRows > 0;
  }

  /**
   * 恢复已删除的成员
   */
  static async restoreMember(userId: number): Promise<boolean> {
    const [affectedRows] = await User.update({ isDeleted: false }, { where: { id: userId } });
    return affectedRows > 0;
  }
}

export default UserDAO;
export type { CustomModelConfig, MemberListItem, UpdateMemberData };
