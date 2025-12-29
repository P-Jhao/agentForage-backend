/**
 * MCP 服务
 * 处理 MCP 相关的业务逻辑，包含权限检查
 */
import McpDAO from "../dao/mcpDAO.js";
import McpForgeDAO from "../dao/mcpForgeDAO.js";
import type { JwtPayload } from "../middleware/tokenAuth.js";
import type { CreateMcpData, UpdateMcpData, McpFilterType } from "../dao/mcpDAO.js";
import { mcpManager, type MCPTool } from "../mcp/index.js";

// MCP 工具接口
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
  // stdio 类型
  command: string | null;
  args: string | null;
  env: string | null;
  // sse/http 类型
  url: string | null;
  headers: string | null;
  userId: number;
  source: string;
  isPublic: boolean;
  timeout: number | null;
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
   * 创建 MCP
   * 管理员可创建所有类型，普通用户只能创建 SSE 和 StreamableHTTP 类型
   * 创建后自动尝试连接
   * @param data MCP 数据（含 isPublic）
   * @param user 当前用户
   */
  static async createMCP(data: Omit<CreateMcpData, "userId">, user: JwtPayload) {
    // 权限检查：普通用户只能创建 SSE 和 StreamableHTTP 类型
    if (user.role !== "root" && data.transportType === "stdio") {
      throw Object.assign(new Error("普通用户无权创建 stdio 类型的 MCP"), { status: 403 });
    }

    // 根据用户角色设置 source
    const source = user.role === "root" ? "builtin" : "user";

    // 创建 MCP
    const mcp = await McpDAO.create(
      {
        ...data,
        userId: user.id,
      },
      source
    );

    // 自动尝试连接
    try {
      const success = await mcpManager.connect(mcp.id);
      if (success) {
        await McpDAO.updateStatus(mcp.id, "connected");
        console.log(`✅ MCP ${mcp.id} 创建后自动连接成功`);
      }
    } catch (error) {
      console.log(`ℹ️ MCP ${mcp.id} 创建后自动连接失败:`, (error as Error).message);
      // 连接失败不影响创建结果，状态保持 disconnected
    }

    // 返回最新状态
    return McpDAO.findById(mcp.id);
  }

  /**
   * 获取 MCP 列表
   * @param options 查询选项
   * @param options.keyword 搜索关键词（可选）
   * @param options.filter 筛选类型：all/builtin/mine/other
   * @param user 当前用户
   */
  static async getMCPList(options: { keyword?: string; filter?: McpFilterType }, user: JwtPayload) {
    const isAdmin = user.role === "root";
    return McpDAO.findAll({
      keyword: options.keyword,
      isAdmin,
      userId: user.id,
      filter: options.filter,
    });
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

    // 获取工具列表
    // 只有当 MCP 状态为 connected 时才尝试获取真实工具列表
    let tools: McpTool[] = [];
    console.log(`[getMCPDetail] MCP ${id} 状态: ${mcp.status}`);
    if (mcp.status === "connected") {
      try {
        console.log(`[getMCPDetail] 开始获取 MCP ${id} 工具列表...`);
        const mcpTools = await mcpManager.getTools(id);
        console.log(`[getMCPDetail] 获取到 ${mcpTools.length} 个工具`);
        tools = mcpTools.map((t: MCPTool) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as Record<string, unknown> | undefined,
        }));
      } catch (error) {
        console.error(`获取 MCP ${id} 工具列表失败:`, (error as Error).message);
        // 连接失败时更新状态为 disconnected
        await McpDAO.updateStatus(id, "disconnected");
        // 返回空工具列表
        tools = [];
      }
    } else {
      console.log(`[getMCPDetail] MCP ${id} 状态不是 connected，跳过获取工具列表`);
    }

    const mcpData = mcp.toJSON();
    return {
      id: mcpData.id,
      name: mcpData.name,
      description: mcpData.description,
      transportType: mcpData.transportType,
      command: mcpData.command,
      args: mcpData.args,
      env: mcpData.env,
      url: mcpData.url,
      headers: mcpData.headers,
      userId: mcpData.userId,
      source: mcpData.source,
      isPublic: mcpData.isPublic,
      timeout: mcpData.timeout,
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
   * 更新 MCP（仅管理员）
   * 更新后自动尝试重新连接
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
    await McpDAO.update(id, data);

    // 断开旧连接，尝试重新连接
    try {
      await mcpManager.disconnect(id);
      const success = await mcpManager.connect(id);
      if (success) {
        await McpDAO.updateStatus(id, "connected");
        console.log(`✅ MCP ${id} 更新后自动连接成功`);
      }
    } catch (error) {
      console.log(`ℹ️ MCP ${id} 更新后自动连接失败:`, (error as Error).message);
      await McpDAO.updateStatus(id, "disconnected");
    }

    // 返回最新状态
    return McpDAO.findById(id);
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

    // 断开 MCP 连接
    try {
      await mcpManager.disconnect(id);
    } catch (error) {
      console.error(`断开 MCP ${id} 连接时出错:`, (error as Error).message);
      // 即使断开失败也继续更新状态
    }

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

    try {
      // 先断开现有连接（如果有）
      await mcpManager.disconnect(id);

      // 尝试重新连接
      const success = await mcpManager.connect(id);

      if (success) {
        // 连接成功，更新状态
        await McpDAO.updateStatus(id, "connected");
        return { status: "connected" as const };
      } else {
        // 连接失败，更新状态
        await McpDAO.updateStatus(id, "disconnected");
        return { status: "disconnected" as const };
      }
    } catch (error) {
      console.error(`MCP ${id} 重连失败:`, (error as Error).message);
      // 连接失败，更新状态
      await McpDAO.updateStatus(id, "disconnected");
      throw Object.assign(new Error(`MCP 连接失败: ${(error as Error).message}`), { status: 500 });
    }
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
