/**
 * MCP 服务
 * 处理 MCP 相关的业务逻辑，包含权限检查
 */
import McpDAO from "../dao/mcpDAO.js";
import McpForgeDAO from "../dao/mcpForgeDAO.js";
import type { JwtPayload } from "../middleware/tokenAuth.js";
import type { CreateMcpData, UpdateMcpData, McpFilterType } from "../dao/mcpDAO.js";
import type { McpStatus, McpPublicApprovalStatus } from "../dao/models/Mcp.js";
import { mcpManager, type MCPTool } from "../mcp/index.js";
import { clearMcpPathConfigCache } from "./forgeAgentService.js";

// 动态导入 ForgeService（避免循环依赖）
const loadForgeService = async () => {
  return (await import("./forgeService.js")).default;
};

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
  toolPathConfig: Record<string, Record<string, "output" | "input" | null>> | null;
  createdAt: Date;
  updatedAt: Date;
  // 创建者信息
  creator: {
    id: number;
    nickname: string | null;
  } | null;
  associatedForges: Array<{
    id: number;
    displayName: string;
    avatar: string | null;
  }>;
  tools: McpTool[];
}

class McpService {
  /**
   * 统一的 MCP 状态变更方法
   * 更新数据库状态，并根据状态变化触发关联 Forge 的摘要更新
   * @param mcpId MCP ID
   * @param newStatus 新状态
   * @param previousStatus 之前的状态（可选，用于判断是否需要更新摘要）
   */
  static async updateMcpStatus(
    mcpId: number,
    newStatus: McpStatus,
    previousStatus?: McpStatus
  ): Promise<void> {
    // 更新数据库状态
    await McpDAO.updateStatus(mcpId, newStatus);

    // 判断是否需要更新关联 Forge 的摘要
    const wasAvailable = previousStatus === "connected";
    const isNowAvailable = newStatus === "connected";

    // 状态没有实质变化，不需要更新摘要
    if (wasAvailable === isNowAvailable) {
      return;
    }

    // 异步更新关联 Forge 的摘要（不阻塞返回）
    setImmediate(async () => {
      try {
        const ForgeService = await loadForgeService();
        if (isNowAvailable) {
          // MCP 变为可用，重新生成包含该 MCP 工具的摘要
          await ForgeService.updateSummariesOnMcpAvailable(mcpId);
        } else {
          // MCP 变为不可用，更新摘要（排除该 MCP 的工具）
          await ForgeService.updateSummariesOnMcpUnavailable(mcpId);
        }
      } catch (error) {
        console.error(`[McpService] 更新 Forge 摘要失败:`, (error as Error).message);
      }
    });
  }

  /**
   * 检查用户是否为管理员（root）
   * @param user 用户信息
   * @throws 403 错误如果不是管理员
   */
  private static checkAdminPermission(user: JwtPayload): void {
    if (user.role !== "root") {
      throw Object.assign(new Error("无权限执行此操作"), { status: 403 });
    }
  }

  /**
   * 检查用户是否为普通用户（user 或 premium）
   * @param user 用户信息
   */
  private static isRegularUser(user: JwtPayload): boolean {
    return user.role === "user" || user.role === "premium";
  }

  /**
   * 创建 MCP
   * 管理员可创建所有类型，普通用户/高级用户只能创建 SSE 和 StreamableHTTP 类型
   * 普通用户/高级用户创建时如果设置公开，需要走审核流程
   * 创建后自动尝试连接
   * @param data MCP 数据（含 isPublic）
   * @param user 当前用户
   */
  static async createMCP(data: Omit<CreateMcpData, "userId">, user: JwtPayload) {
    const isRegular = this.isRegularUser(user);

    // 权限检查：普通用户/高级用户只能创建 SSE 和 StreamableHTTP 类型
    if (isRegular && data.transportType === "stdio") {
      throw Object.assign(new Error("无权创建 stdio 类型的 MCP"), { status: 403 });
    }

    // 根据用户角色设置 source
    const source = user.role === "root" ? "builtin" : "user";

    // 普通用户/高级用户创建时，如果设置公开，需要走审核流程
    // 实际 isPublic 保持 false，但设置 publicApprovalStatus 为 pending
    let actualIsPublic = data.isPublic ?? false;
    let approvalStatus: "none" | "pending" = "none";

    if (isRegular && data.isPublic) {
      actualIsPublic = false; // 不直接公开
      approvalStatus = "pending"; // 进入审核状态
    }

    // 创建 MCP
    const mcp = await McpDAO.create(
      {
        ...data,
        isPublic: actualIsPublic,
        publicApprovalStatus: approvalStatus,
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
  static async getMCPDetail(
    id: number,
    userId: number,
    isAdmin: boolean = false
  ): Promise<McpDetailResult> {
    const mcp = await McpDAO.findByIdWithCreator(id);
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

    // 解析 toolPathConfig
    let toolPathConfig: Record<string, Record<string, "output" | "input" | null>> | null = null;
    if (mcpData.toolPathConfig) {
      try {
        toolPathConfig = JSON.parse(mcpData.toolPathConfig);
      } catch {
        console.error(`解析 MCP ${id} 的 toolPathConfig 失败`);
      }
    }

    // 提取创建者信息
    const mcpWithUser = mcp as unknown as {
      user?: { id: number; nickname: string | null };
    };
    const creator = mcpWithUser.user
      ? { id: mcpWithUser.user.id, nickname: mcpWithUser.user.nickname }
      : null;

    // 非管理员用户隐藏敏感信息（启动命令、参数、环境变量、URL、请求头）
    return {
      id: mcpData.id,
      name: mcpData.name,
      description: mcpData.description,
      transportType: mcpData.transportType,
      // 敏感字段：仅管理员可见
      command: isAdmin ? mcpData.command : null,
      args: isAdmin ? mcpData.args : null,
      env: isAdmin ? mcpData.env : null,
      url: isAdmin ? mcpData.url : null,
      headers: isAdmin ? mcpData.headers : null,
      userId: mcpData.userId,
      source: mcpData.source,
      isPublic: mcpData.isPublic,
      timeout: mcpData.timeout,
      remarks: mcpData.remarks,
      example: mcpData.example,
      status: mcpData.status,
      toolPathConfig: isAdmin ? toolPathConfig : null,
      createdAt: mcp.createdAt,
      updatedAt: mcp.updatedAt,
      creator,
      associatedForges,
      tools,
    };
  }

  /**
   * 更新 MCP
   * 管理员可更新所有 MCP，普通用户只能更新自己创建的 MCP
   * 普通用户/高级用户将 isPublic 从 false 改为 true 时，需要走审核流程
   * 更新后自动尝试重新连接
   * @param id MCP ID
   * @param data 更新数据
   * @param user 当前用户
   */
  static async updateMCP(id: number, data: UpdateMcpData, user: JwtPayload) {
    // 检查 MCP 是否存在
    const mcp = await McpDAO.findById(id);
    if (!mcp) {
      throw Object.assign(new Error("MCP 不存在"), { status: 404 });
    }

    // 权限检查：管理员可更新所有，普通用户只能更新自己创建的
    const isAdmin = user.role === "root";
    const isOwner = mcp.userId === user.id;
    const isRegular = this.isRegularUser(user);

    if (!isAdmin && !isOwner) {
      throw Object.assign(new Error("无权限修改此 MCP"), { status: 403 });
    }

    // 普通用户不能修改 stdio 类型的 MCP（即使是自己创建的，因为普通用户不能创建 stdio 类型）
    if (!isAdmin && mcp.transportType === "stdio") {
      throw Object.assign(new Error("无权限修改 stdio 类型的 MCP"), { status: 403 });
    }

    // 普通用户不能将传输方式改为 stdio
    if (!isAdmin && data.transportType === "stdio") {
      throw Object.assign(new Error("普通用户无权使用 stdio 传输方式"), { status: 403 });
    }

    // 构建更新数据
    const updateData: UpdateMcpData = { ...data };

    // 检查公开状态变更
    const wasPending = mcp.publicApprovalStatus === "pending";
    const wasPublic = mcp.isPublic;
    const wantsPublic = data.isPublic === true;
    const wantsPrivate = data.isPublic === false;

    // 普通用户/高级用户的公开状态处理
    if (isRegular) {
      // 情况1：在审核中且用户取消公开（将 isPublic 设为 false）
      if (wasPending && wantsPrivate) {
        updateData.publicApprovalStatus = "cancelled";
        updateData.publicApprovalNote = "用户主动取消公开申请";
        updateData.publicApprovalAt = new Date();
        updateData.publicApprovalBy = user.id;
      }
      // 情况2：当前不是公开状态，用户想要公开 -> 需要走审核流程
      else if (!wasPublic && wantsPublic) {
        // 不直接设置为公开，而是进入审核状态
        updateData.isPublic = false;
        updateData.publicApprovalStatus = "pending";
        updateData.publicApprovalNote = null;
        updateData.publicApprovalAt = null;
        updateData.publicApprovalBy = null;
      }
    }

    // 更新 MCP
    await McpDAO.update(id, updateData);

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

    // 更新状态为 closed（管理员主动关闭），并触发摘要更新
    await this.updateMcpStatus(id, "closed", mcp.status);

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

    const previousStatus = mcp.status;

    try {
      // 先断开现有连接（如果有）
      await mcpManager.disconnect(id);

      // 尝试重新连接
      const success = await mcpManager.connect(id);

      if (success) {
        await this.updateMcpStatus(id, "connected", previousStatus);
        return { status: "connected" as const };
      } else {
        await this.updateMcpStatus(id, "disconnected", previousStatus);
        return { status: "disconnected" as const };
      }
    } catch (error) {
      console.error(`MCP ${id} 重连失败:`, (error as Error).message);
      await this.updateMcpStatus(id, "disconnected", previousStatus);
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

  /**
   * 更新 MCP 工具路径配置（仅管理员）
   * @param id MCP ID
   * @param toolPathConfig 工具路径配置
   * @param user 当前用户
   */
  static async updateToolPathConfig(
    id: number,
    toolPathConfig: Record<string, Record<string, "output" | "input" | null>> | null,
    user: JwtPayload
  ) {
    // 权限检查
    this.checkAdminPermission(user);

    // 检查 MCP 是否存在
    const mcp = await McpDAO.findById(id);
    if (!mcp) {
      throw Object.assign(new Error("MCP 不存在"), { status: 404 });
    }

    // 更新配置
    const configStr = toolPathConfig ? JSON.stringify(toolPathConfig) : null;
    await McpDAO.update(id, { toolPathConfig: configStr });

    // 清除缓存
    clearMcpPathConfigCache(id);

    return { success: true };
  }

  /**
   * 申请公开 MCP（普通用户）
   * 将 MCP 的公开审核状态设置为 pending
   * @param id MCP ID
   * @param user 当前用户
   */
  static async requestPublic(id: number, user: JwtPayload) {
    // 检查 MCP 是否存在
    const mcp = await McpDAO.findById(id);
    if (!mcp) {
      throw Object.assign(new Error("MCP 不存在"), { status: 404 });
    }

    // 检查是否为 MCP 创建者
    if (mcp.userId !== user.id) {
      throw Object.assign(new Error("只能申请公开自己创建的 MCP"), { status: 403 });
    }

    // 检查是否已经公开
    if (mcp.isPublic) {
      throw Object.assign(new Error("该 MCP 已经是公开状态"), { status: 400 });
    }

    // 检查是否已经在审核中
    if (mcp.publicApprovalStatus === "pending") {
      throw Object.assign(new Error("该 MCP 已在审核中，请耐心等待"), { status: 400 });
    }

    // 更新审核状态为 pending
    await McpDAO.update(id, {
      publicApprovalStatus: "pending",
      publicApprovalNote: null,
      publicApprovalAt: null,
      publicApprovalBy: null,
    });

    return { success: true };
  }

  /**
   * 审核公开申请（仅管理员/运营员）
   * @param id MCP ID
   * @param action 审核动作：approve（通过）/ reject（拒绝）
   * @param note 审核备注（拒绝时必填）
   * @param user 当前用户
   */
  static async reviewPublicRequest(
    id: number,
    action: "approve" | "reject",
    note: string | null,
    user: JwtPayload
  ) {
    // 权限检查：仅 root 或 operator 可审核
    if (user.role !== "root" && user.role !== "operator") {
      throw Object.assign(new Error("无权限执行此操作"), { status: 403 });
    }

    // 检查 MCP 是否存在
    const mcp = await McpDAO.findById(id);
    if (!mcp) {
      throw Object.assign(new Error("MCP 不存在"), { status: 404 });
    }

    // 检查是否在待审核状态
    if (mcp.publicApprovalStatus !== "pending") {
      throw Object.assign(new Error("该 MCP 不在待审核状态"), { status: 400 });
    }

    // 拒绝时必须填写原因
    if (action === "reject" && !note?.trim()) {
      throw Object.assign(new Error("拒绝时必须填写原因"), { status: 400 });
    }

    const now = new Date();

    if (action === "approve") {
      // 通过：设置为公开，更新审核状态
      await McpDAO.update(id, {
        isPublic: true,
        publicApprovalStatus: "approved",
        publicApprovalNote: note || null,
        publicApprovalAt: now,
        publicApprovalBy: user.id,
      });
    } else {
      // 拒绝：保持私有，更新审核状态
      await McpDAO.update(id, {
        publicApprovalStatus: "rejected",
        publicApprovalNote: note,
        publicApprovalAt: now,
        publicApprovalBy: user.id,
      });
    }

    return { success: true, action };
  }

  /**
   * 获取待审核的公开申请列表（仅管理员/运营员）
   * @param options 查询选项
   * @param user 当前用户
   */
  static async getPendingPublicRequests(
    options: {
      page?: number;
      pageSize?: number;
      status?: McpPublicApprovalStatus;
    },
    user: JwtPayload
  ) {
    // 权限检查：仅 root 或 operator 可查看
    if (user.role !== "root" && user.role !== "operator") {
      throw Object.assign(new Error("无权限执行此操作"), { status: 403 });
    }

    return McpDAO.findByApprovalStatus(options);
  }
}

export default McpService;
