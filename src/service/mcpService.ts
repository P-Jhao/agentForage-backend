/**
 * MCP 服务
 * 处理 MCP 相关的业务逻辑，包含权限检查
 */
import McpDAO from "../dao/mcpDAO.js";
import McpForgeDAO from "../dao/mcpForgeDAO.js";
import type { JwtPayload } from "../middleware/tokenAuth.js";
import type { CreateMcpData, UpdateMcpData } from "../dao/mcpDAO.js";

// MCP 工具接口（暂时使用 mock 数据）
interface McpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

// MCP 详情接口（含关联 Forge 和工具列表）
interface McpDetailResult {
  id: number;
  name: string;
  description: string | null;
  transportType: string;
  connectionUrl: string;
  userId: number;
  source: string;
  isPublic: boolean;
  timeout: number | null;
  headers: string | null;
  remarks: string | null;
  example: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  associatedForges: Array<{
    id: number;
    displayName: string;
    avatar: string | null;
  }>;
  tools: McpTool[];
}

class McpService {
  /**
   * 检查用户是否为管理员
   * @param user 用户信息
   * @throws 403 错误如果不是管理员
   */
  private static checkAdminPermission(user: JwtPayload): void {
    if (user.role !== "root") {
      throw Object.assign(new Error("无权限执行此操作"), { status: 403 });
    }
  }

  /**
   * 创建 MCP（仅管理员）
   * @param data MCP 数据
   * @param user 当前用户
   */
  static async createMCP(data: Omit<CreateMcpData, "userId">, user: JwtPayload) {
    // 权限检查
    this.checkAdminPermission(user);

    // 创建 MCP
    const mcp = await McpDAO.create({
      ...data,
      userId: user.id,
    });

    return mcp;
  }

  /**
   * 获取 MCP 列表
   * @param keyword 搜索关键词（可选）
   * @param user 当前用户（用于判断是否为管理员）
   */
  static async getMCPList(keyword?: string, user?: JwtPayload) {
    const isAdmin = user?.role === "root";
    return McpDAO.findAll(keyword, isAdmin);
  }

  /**
   * 获取 MCP 详情
   * @param id MCP ID
   */
  static async getMCP(id: number) {
    const mcp = await McpDAO.findById(id);
    if (!mcp) {
      throw Object.assign(new Error("MCP 不存在"), { status: 404 });
    }
    return mcp;
  }

  /**
   * 获取 MCP 详情（含当前用户可见的关联 Forge、工具列表）
   * @param id MCP ID
   * @param userId 当前用户 ID
   */
  static async getMCPDetail(id: number, userId: number): Promise<McpDetailResult> {
    const mcp = await McpDAO.findById(id);
    if (!mcp) {
      throw Object.assign(new Error("MCP 不存在"), { status: 404 });
    }

    // 获取当前用户可见范围内的关联 Forge
    const associations = await McpForgeDAO.findByMcpIdAndUserId(id, userId);
    const associatedForges = associations.map((a) => {
      // 使用 unknown 中转，因为 Sequelize 的关联类型不完整
      const record = a as unknown as {
        forge: {
          id: number;
          displayName: string;
          avatar: string | null;
          description: string | null;
          source: string;
          usageCount: number;
        };
      };
      return {
        id: record.forge.id,
        displayName: record.forge.displayName,
        avatar: record.forge.avatar,
        description: record.forge.description,
        source: record.forge.source,
        usageCount: record.forge.usageCount,
      };
    });

    // 获取工具列表（暂时返回 mock 数据）
    const tools = this.getMockTools(mcp.name);

    const mcpData = mcp.toJSON();
    return {
      id: mcpData.id,
      name: mcpData.name,
      description: mcpData.description,
      transportType: mcpData.transportType,
      connectionUrl: mcpData.connectionUrl,
      userId: mcpData.userId,
      source: mcpData.source,
      isPublic: mcpData.isPublic,
      timeout: mcpData.timeout,
      headers: mcpData.headers,
      remarks: mcpData.remarks,
      example: mcpData.example,
      status: mcpData.status,
      createdAt: mcp.createdAt,
      updatedAt: mcp.updatedAt,
      associatedForges,
      tools,
    };
  }

  /**
   * 获取 mock 工具列表
   * TODO: 后续实现真实的工具列表获取
   */
  private static getMockTools(mcpName: string): McpTool[] {
    // 根据 MCP 名称返回不同的 mock 工具
    if (mcpName.includes("文件")) {
      return [
        { name: "read_file", description: "读取文件内容" },
        { name: "write_file", description: "写入文件内容" },
        { name: "list_directory", description: "列出目录内容" },
      ];
    }
    if (mcpName.includes("搜索")) {
      return [
        { name: "web_search", description: "网页搜索" },
        { name: "image_search", description: "图片搜索" },
      ];
    }
    if (mcpName.includes("数据库")) {
      return [
        { name: "query", description: "执行 SQL 查询" },
        { name: "execute", description: "执行 SQL 语句" },
      ];
    }
    return [{ name: "default_tool", description: "默认工具" }];
  }

  /**
   * 更新 MCP（仅管理员）
   * @param id MCP ID
   * @param data 更新数据
   * @param user 当前用户
   */
  static async updateMCP(id: number, data: UpdateMcpData, user: JwtPayload) {
    // 权限检查
    this.checkAdminPermission(user);

    // 检查 MCP 是否存在
    const mcp = await McpDAO.findById(id);
    if (!mcp) {
      throw Object.assign(new Error("MCP 不存在"), { status: 404 });
    }

    // 更新 MCP
    const updated = await McpDAO.update(id, data);
    return updated;
  }

  /**
   * 关闭 MCP（仅管理员）
   * 断开与 MCP 服务的连接，更新状态为 closed
   * @param id MCP ID
   * @param user 当前用户
   */
  static async closeMCP(id: number, user: JwtPayload) {
    // 权限检查
    this.checkAdminPermission(user);

    // 检查 MCP 是否存在
    const mcp = await McpDAO.findById(id);
    if (!mcp) {
      throw Object.assign(new Error("MCP 不存在"), { status: 404 });
    }

    // TODO: 实际断开连接的逻辑

    // 更新状态为 closed（管理员主动关闭）
    await McpDAO.updateStatus(id, "closed");

    return { success: true };
  }

  /**
   * 重连 MCP（所有用户可用）
   * 尝试重新连接到 MCP 服务
   * @param id MCP ID
   */
  static async reconnectMCP(id: number) {
    // 检查 MCP 是否存在
    const mcp = await McpDAO.findById(id);
    if (!mcp) {
      throw Object.assign(new Error("MCP 不存在"), { status: 404 });
    }

    // TODO: 实际重连的逻辑，这里暂时模拟成功
    // 实际实现时需要根据 transportType 和 connectionUrl 进行连接测试

    // 模拟连接成功，更新状态
    await McpDAO.updateStatus(id, "connected");

    return { status: "connected" as const };
  }

  /**
   * 删除 MCP（仅管理员）
   * 级联删除所有关联的 MCPForge 记录
   * @param id MCP ID
   * @param user 当前用户
   */
  static async deleteMCP(id: number, user: JwtPayload) {
    // 权限检查
    this.checkAdminPermission(user);

    // 检查 MCP 是否存在
    const mcp = await McpDAO.findById(id);
    if (!mcp) {
      throw Object.assign(new Error("MCP 不存在"), { status: 404 });
    }

    // 统计受影响的 Forge 数量
    const affectedForgeCount = await McpForgeDAO.countByMcpId(id);

    // 删除 MCP（数据库级联删除会自动删除 MCPForge 关联）
    await McpDAO.delete(id);

    // TODO: 标记对应 Forge 的 summary 为待更新（后续实现 LLM 重新生成）

    return { affectedForgeCount };
  }

  /**
   * 验证 Forge 公开时的 MCP 合规性
   * 检查 Forge 关联的所有 MCP 是否都是公开的
   * @param forgeId Forge ID
   */
  static async validateForgePublish(forgeId: number) {
    // 查找非公开的 MCP
    const invalidMcps = await McpForgeDAO.findNonPublicMcpsByForgeId(forgeId);

    return {
      valid: invalidMcps.length === 0,
      invalidMcps,
    };
  }
}

export default McpService;
