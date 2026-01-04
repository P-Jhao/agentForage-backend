/**
 * MCP 数据访问对象
 */
import { Op } from "sequelize";
import { Mcp, User } from "./models/index.js";
import type {
  McpStatus,
  McpCreationAttributes,
  McpSource,
  McpPublicApprovalStatus,
} from "./models/Mcp.js";

// 创建 MCP 的参数类型（不含 source 和 status，由系统自动设置）
export type CreateMcpData = Omit<McpCreationAttributes, "source" | "status">;

// 更新 MCP 的参数类型
export type UpdateMcpData = Partial<Omit<McpCreationAttributes, "userId" | "source">>;

// MCP 列表筛选类型
export type McpFilterType = "all" | "builtin" | "mine" | "other";

class McpDAO {
  /**
   * 创建 MCP
   * @param data MCP 数据
   * @param source MCP 来源（builtin: 管理员创建, user: 普通用户创建）
   */
  static async create(data: CreateMcpData, source: McpSource = "builtin") {
    return await Mcp.create({
      ...data,
      source,
      status: "disconnected",
    });
  }

  /**
   * 根据 ID 查询 MCP
   * @param id MCP ID
   */
  static async findById(id: number) {
    return await Mcp.findByPk(id);
  }

  /**
   * 查询所有 MCP 列表（含创建者信息）
   * @param options 查询选项
   * @param options.keyword 搜索关键词（可选）
   * @param options.isAdmin 是否为管理员
   * @param options.userId 当前用户 ID
   * @param options.filter 筛选类型：all/builtin/mine/other
   */
  static async findAll(options: {
    keyword?: string;
    isAdmin: boolean;
    userId: number;
    filter?: McpFilterType;
  }) {
    const { keyword, isAdmin, userId, filter = "all" } = options;
    const where: Record<string, unknown> = {};

    // 普通用户过滤掉 closed 状态的 MCP
    if (!isAdmin) {
      where.status = { [Op.ne]: "closed" };
    }

    // 可见性过滤：普通用户只能看到公开的 MCP 或自己创建的私有 MCP
    if (!isAdmin) {
      where[Op.or as unknown as string] = [{ isPublic: true }, { userId }];
    }

    // 筛选类型
    switch (filter) {
      case "builtin":
        // 内置：管理员创建的公开 MCP
        where.source = "builtin";
        where.isPublic = true;
        break;
      case "mine":
        // 我的：当前用户创建的 MCP
        where.userId = userId;
        break;
      case "other":
        // 其他：其他用户创建的公开 MCP（非内置）
        where.source = "user";
        where.isPublic = true;
        where.userId = { [Op.ne]: userId };
        break;
      // all: 不添加额外筛选
    }

    // 查询配置：包含创建者信息
    const queryOptions = {
      where,
      order: [["createdAt", "DESC"]] as [string, string][],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nickname"],
        },
      ],
    };

    // 关键词搜索
    if (keyword) {
      const keywordCondition = {
        [Op.or]: [
          { name: { [Op.like]: `%${keyword}%` } },
          { description: { [Op.like]: `%${keyword}%` } },
        ],
      };
      if (Object.keys(where).length > 0) {
        return await Mcp.findAll({
          ...queryOptions,
          where: { [Op.and]: [where, keywordCondition] },
        });
      } else {
        return await Mcp.findAll({
          ...queryOptions,
          where: keywordCondition,
        });
      }
    }

    return await Mcp.findAll(queryOptions);
  }

  /**
   * 更新 MCP
   * @param id MCP ID
   * @param data 更新数据
   */
  static async update(id: number, data: UpdateMcpData) {
    const [affectedCount] = await Mcp.update(data, { where: { id } });
    if (affectedCount === 0) {
      return null;
    }
    return await Mcp.findByPk(id);
  }

  /**
   * 删除 MCP
   * @param id MCP ID
   */
  static async delete(id: number) {
    return await Mcp.destroy({ where: { id } });
  }

  /**
   * 更新 MCP 连接状态
   * @param id MCP ID
   * @param status 连接状态
   */
  static async updateStatus(id: number, status: McpStatus) {
    const [affectedCount] = await Mcp.update({ status }, { where: { id } });
    return affectedCount > 0;
  }

  /**
   * 根据状态查询 MCP 列表
   * @param status 连接状态
   */
  static async findByStatus(status: McpStatus) {
    return await Mcp.findAll({
      where: { status },
      order: [["createdAt", "ASC"]],
    });
  }

  /**
   * 根据公开审核状态查询 MCP 列表（含创建者信息）
   * @param options 查询选项
   * @param options.page 页码（默认 1）
   * @param options.pageSize 每页数量（默认 10）
   * @param options.status 审核状态筛选（可选，默认查询 pending）
   */
  static async findByApprovalStatus(options: {
    page?: number;
    pageSize?: number;
    status?: McpPublicApprovalStatus;
  }) {
    const { page = 1, pageSize = 10, status = "pending" } = options;
    const offset = (page - 1) * pageSize;

    const { count, rows } = await Mcp.findAndCountAll({
      where: { publicApprovalStatus: status },
      order: [["updatedAt", "DESC"]],
      limit: pageSize,
      offset,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "username", "nickname"],
        },
      ],
    });

    return {
      mcps: rows,
      pagination: {
        total: count,
        page,
        pageSize,
      },
    };
  }
}

export default McpDAO;
