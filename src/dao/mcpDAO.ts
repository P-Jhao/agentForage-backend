/**
 * MCP 数据访问对象
 */
import { Op } from "sequelize";
import { Mcp } from "./models/index.js";
import type { McpStatus, McpCreationAttributes } from "./models/Mcp.js";

// 创建 MCP 的参数类型
export type CreateMcpData = Omit<McpCreationAttributes, "source" | "isPublic" | "status">;

// 更新 MCP 的参数类型
export type UpdateMcpData = Partial<Omit<McpCreationAttributes, "userId" | "source" | "isPublic">>;

class McpDAO {
  /**
   * 创建 MCP
   * @param data MCP 数据
   */
  static async create(data: CreateMcpData) {
    return await Mcp.create({
      ...data,
      source: "builtin",
      isPublic: true,
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
   * 查询所有 MCP 列表
   * @param keyword 搜索关键词（可选）
   */
  static async findAll(keyword?: string) {
    const where: Record<string, unknown> = {};

    if (keyword) {
      where[Op.or as unknown as string] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { description: { [Op.like]: `%${keyword}%` } },
      ];
    }

    return await Mcp.findAll({
      where,
      order: [["createdAt", "DESC"]],
    });
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
}

export default McpDAO;
