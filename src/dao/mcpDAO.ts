/**
 * MCP 数据访问对象
 */
import { Op } from "sequelize";
import { Mcp } from "./models/index.js";
import type { McpSource, McpStatus } from "./models/Mcp.js";

interface CreateMcpData {
  name: string;
  description: string;
  author: string;
  source: McpSource;
  tools: string[];
  userId: number;
}

interface QueryMcpParams {
  source?: McpSource;
  userId?: number;
  keyword?: string;
}

class McpDAO {
  // 创建 MCP
  static async create(data: CreateMcpData) {
    return await Mcp.create(data);
  }

  // 根据 ID 查询
  static async findById(id: number) {
    return await Mcp.findByPk(id);
  }

  // 查询广场 MCP（官方 + 社区）
  static async findPlazaList(params?: { keyword?: string; source?: McpSource }) {
    const where: Record<string, unknown> = {
      source: { [Op.in]: ["official", "community"] },
    };

    if (params?.source) {
      where.source = params.source;
    }
    if (params?.keyword) {
      where[Op.or as unknown as string] = [
        { name: { [Op.like]: `%${params.keyword}%` } },
        { author: { [Op.like]: `%${params.keyword}%` } },
        { description: { [Op.like]: `%${params.keyword}%` } },
      ];
    }
    return await Mcp.findAll({ where, order: [["updatedAt", "DESC"]] });
  }

  // 查询用户自定义 MCP
  static async findByUserId(userId: number) {
    return await Mcp.findAll({
      where: { userId, source: "custom" },
      order: [["updatedAt", "DESC"]],
    });
  }

  // 更新 MCP
  static async updateById(id: number, data: Partial<CreateMcpData & { status: McpStatus }>) {
    return await Mcp.update(data, { where: { id } });
  }

  // 删除 MCP
  static async deleteById(id: number) {
    return await Mcp.destroy({ where: { id } });
  }
}

export default McpDAO;
