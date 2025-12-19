/**
 * MCP-Forge 关联数据访问对象
 * 用于管理 MCP 与 Forge 的多对多关系，支持工具级别的选择
 */
import { Op } from "sequelize";
import { McpForge, Mcp, Agent } from "./models/index.js";
import type { ToolInfo } from "./models/McpForge.js";

// MCP 工具关联参数
export interface McpToolAssociation {
  mcpId: number;
  tools: ToolInfo[];
}

class McpForgeDAO {
  /**
   * 创建 MCP-Forge 关联（不带工具）
   * @param mcpId MCP ID
   * @param forgeId Forge ID
   */
  static async create(mcpId: number, forgeId: number) {
    return await McpForge.create({ mcpId, forgeId, tools: [] });
  }

  /**
   * 创建 MCP-Forge 关联（带工具）
   * @param mcpId MCP ID
   * @param forgeId Forge ID
   * @param tools 选中的工具列表
   */
  static async createWithTools(mcpId: number, forgeId: number, tools: ToolInfo[]) {
    return await McpForge.create({ mcpId, forgeId, tools });
  }

  /**
   * 批量创建 MCP-Forge 关联（不带工具，兼容旧接口）
   * @param mcpIds MCP ID 数组
   * @param forgeId Forge ID
   */
  static async bulkCreate(mcpIds: number[], forgeId: number) {
    const records = mcpIds.map((mcpId) => ({ mcpId, forgeId, tools: [] }));
    return await McpForge.bulkCreate(records, { ignoreDuplicates: true });
  }

  /**
   * 批量创建 MCP-Forge 关联（带工具）
   * @param associations MCP 工具关联数组
   * @param forgeId Forge ID
   */
  static async bulkCreateWithTools(associations: McpToolAssociation[], forgeId: number) {
    const records = associations.map(({ mcpId, tools }) => ({ mcpId, forgeId, tools }));
    return await McpForge.bulkCreate(records, { ignoreDuplicates: true });
  }

  /**
   * 根据 Forge ID 查询关联的 MCP 列表
   * @param forgeId Forge ID
   */
  static async findByForgeId(forgeId: number) {
    return await McpForge.findAll({
      where: { forgeId },
      include: [
        {
          model: Mcp,
          as: "mcp",
        },
      ],
    });
  }

  /**
   * 根据 MCP ID 查询关联的 Forge 列表
   * @param mcpId MCP ID
   */
  static async findByMcpId(mcpId: number) {
    return await McpForge.findAll({
      where: { mcpId },
      include: [
        {
          model: Agent,
          as: "forge",
        },
      ],
    });
  }

  /**
   * 根据 MCP ID 查询当前用户可见范围内的 Forge 列表
   * 可见范围：用户自己创建的 Forge + 公开的 Forge
   * @param mcpId MCP ID
   * @param userId 当前用户 ID
   */
  static async findByMcpIdAndUserId(mcpId: number, userId: number) {
    return await McpForge.findAll({
      where: { mcpId },
      include: [
        {
          model: Agent,
          as: "forge",
          where: {
            isActive: true,
            [Op.or]: [
              { userId }, // 用户自己创建的
              { isPublic: true }, // 公开的
            ],
          },
        },
      ],
    });
  }

  /**
   * 删除指定的 MCP-Forge 关联
   * @param mcpId MCP ID
   * @param forgeId Forge ID
   */
  static async delete(mcpId: number, forgeId: number) {
    return await McpForge.destroy({ where: { mcpId, forgeId } });
  }

  /**
   * 删除 MCP 的所有关联（用于删除 MCP 时的级联处理）
   * @param mcpId MCP ID
   */
  static async deleteByMcpId(mcpId: number) {
    return await McpForge.destroy({ where: { mcpId } });
  }

  /**
   * 删除 Forge 的所有关联（用于删除 Forge 时的级联处理）
   * @param forgeId Forge ID
   */
  static async deleteByForgeId(forgeId: number) {
    return await McpForge.destroy({ where: { forgeId } });
  }

  /**
   * 统计 MCP 关联的 Forge 数量
   * @param mcpId MCP ID
   */
  static async countByMcpId(mcpId: number) {
    return await McpForge.count({ where: { mcpId } });
  }

  /**
   * 更新 Forge 的 MCP 关联（先删除旧关联，再创建新关联）
   * @param forgeId Forge ID
   * @param mcpIds 新的 MCP ID 数组
   */
  static async updateForgeAssociations(forgeId: number, mcpIds: number[]) {
    // 删除旧关联
    await McpForge.destroy({ where: { forgeId } });
    // 创建新关联
    if (mcpIds.length > 0) {
      const records = mcpIds.map((mcpId) => ({ mcpId, forgeId, tools: [] }));
      await McpForge.bulkCreate(records);
    }
  }

  /**
   * 更新 Forge 的 MCP 工具关联（先删除旧关联，再创建新关联）
   * @param forgeId Forge ID
   * @param associations 新的 MCP 工具关联数组
   */
  static async updateForgeToolAssociations(forgeId: number, associations: McpToolAssociation[]) {
    // 删除旧关联
    await McpForge.destroy({ where: { forgeId } });
    // 创建新关联
    if (associations.length > 0) {
      const records = associations.map(({ mcpId, tools }) => ({ mcpId, forgeId, tools }));
      await McpForge.bulkCreate(records);
    }
  }

  /**
   * 获取 Forge 关联的所有工具（用于 LLM 调用）
   * @param forgeId Forge ID
   * @returns 工具列表，包含 mcpId 信息
   */
  static async getForgeTools(forgeId: number): Promise<Array<ToolInfo & { mcpId: number }>> {
    const associations = await McpForge.findAll({
      where: { forgeId },
      include: [
        {
          model: Mcp,
          as: "mcp",
          where: { status: "connected" }, // 只返回已连接的 MCP 的工具
        },
      ],
    });

    const tools: Array<ToolInfo & { mcpId: number }> = [];
    for (const assoc of associations) {
      for (const tool of assoc.tools) {
        tools.push({ ...tool, mcpId: assoc.mcpId });
      }
    }
    return tools;
  }

  /**
   * 检查 Forge 关联的所有 MCP 是否都是公开的
   * @param forgeId Forge ID
   * @returns 非公开的 MCP 名称列表
   */
  static async findNonPublicMcpsByForgeId(forgeId: number): Promise<string[]> {
    const associations = await McpForge.findAll({
      where: { forgeId },
      include: [
        {
          model: Mcp,
          as: "mcp",
          where: { isPublic: false },
        },
      ],
    });
    return associations.map((a) => (a as McpForge & { mcp: Mcp }).mcp.name);
  }
}

export default McpForgeDAO;
