/**
 * MCP 数据访问层属性测试
 * 使用 fast-check 进行属性测试
 *
 * 运行测试: pnpm test
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fc from "fast-check";
import { sequelize, User, Mcp, McpForge, Agent } from "../dao/models/index.js";
import McpDAO from "../dao/mcpDAO.js";
import McpForgeDAO from "../dao/mcpForgeDAO.js";

// 测试用户数据
let adminUser: User;
let normalUser: User;

// 测试前初始化数据库
beforeAll(async () => {
  // 同步数据库（使用 force 确保干净的测试环境）
  await sequelize.sync({ force: true });

  // 创建测试用户
  adminUser = await User.create({
    username: "testAdmin",
    password: "password123",
    role: "root",
  });

  normalUser = await User.create({
    username: "testUser",
    password: "password123",
    role: "user",
  });
});

// 每个测试前清理 MCP 和 McpForge 数据
beforeEach(async () => {
  await McpForge.destroy({ where: {} });
  await Mcp.destroy({ where: {} });
  await Agent.destroy({ where: {} });
});

// 测试后关闭数据库连接
afterAll(async () => {
  await sequelize.close();
});

describe("McpDAO", () => {
  describe("属性 1：管理员权限校验", () => {
    /**
     * 属性 1：管理员权限校验
     * 对于任何创建、编辑、删除、关闭 MCP 的操作，
     * 只有 role='root' 的用户应该能够成功执行。
     * 验证：需求 1.7, 1.8, 3.1, 3.6
     *
     * 注意：权限校验在 Service 层实现，DAO 层只负责数据操作
     * 这里测试的是 DAO 层的基本功能正确性
     */
    it("管理员可以创建 MCP", async () => {
      const mcp = await McpDAO.create({
        name: "测试 MCP",
        transportType: "sse",
        url: "http://localhost:3000/sse",
        userId: adminUser.id,
      });

      expect(mcp).toBeDefined();
      expect(mcp.id).toBeGreaterThan(0);
      expect(mcp.name).toBe("测试 MCP");
      expect(mcp.source).toBe("builtin");
      expect(mcp.isPublic).toBe(true);
      expect(mcp.status).toBe("disconnected");
    });

    it("创建的 MCP 应自动设置 source 为 builtin、isPublic 为 true", () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            transportType: fc.constantFrom("stdio", "sse", "streamableHttp") as fc.Arbitrary<
              "stdio" | "sse" | "streamableHttp"
            >,
            url: fc.webUrl(),
          }),
          async (data) => {
            const mcp = await McpDAO.create({
              ...data,
              userId: adminUser.id,
            });

            // 验证自动设置的字段
            expect(mcp.source).toBe("builtin");
            expect(mcp.isPublic).toBe(true);
            expect(mcp.status).toBe("disconnected");

            // 清理
            await McpDAO.delete(mcp.id);
          }
        ),
        { numRuns: 10 }
      );
    });

    it("更新 MCP 应正确修改字段", async () => {
      // 创建测试 MCP
      const mcp = await McpDAO.create({
        name: "原始名称",
        transportType: "sse",
        url: "http://localhost:3000/sse",
        userId: adminUser.id,
      });

      // 更新 MCP
      const updated = await McpDAO.update(mcp.id, {
        name: "新名称",
        description: "新描述",
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe("新名称");
      expect(updated?.description).toBe("新描述");
    });

    it("删除 MCP 应成功移除记录", async () => {
      // 创建测试 MCP
      const mcp = await McpDAO.create({
        name: "待删除 MCP",
        transportType: "sse",
        url: "http://localhost:3000/sse",
        userId: adminUser.id,
      });

      // 删除 MCP
      const deletedCount = await McpDAO.delete(mcp.id);
      expect(deletedCount).toBe(1);

      // 验证已删除
      const found = await McpDAO.findById(mcp.id);
      expect(found).toBeNull();
    });
  });

  describe("属性 4：数据一致性", () => {
    /**
     * 属性 4：数据一致性
     * 对于任何 MCP，其 updatedAt 时间戳应该在修改后被更新。
     * 验证：需求 7.7
     *
     * 注意：MySQL 的 TIMESTAMP 精度为秒级，需要等待足够时间
     */
    it("修改 MCP 后 updatedAt 应该更新", async () => {
      // 创建测试 MCP
      const mcp = await McpDAO.create({
        name: "测试 MCP",
        transportType: "sse",
        url: "http://localhost:3000/sse",
        userId: adminUser.id,
      });

      const originalUpdatedAt = mcp.updatedAt;

      // 等待超过 1 秒确保时间戳不同（MySQL TIMESTAMP 精度为秒）
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // 更新 MCP
      const updated = await McpDAO.update(mcp.id, { name: "新名称" });

      expect(updated).toBeDefined();
      // 使用秒级比较，避免毫秒精度问题
      const originalSeconds = Math.floor(originalUpdatedAt.getTime() / 1000);
      const updatedSeconds = Math.floor(updated!.updatedAt.getTime() / 1000);
      expect(updatedSeconds).toBeGreaterThan(originalSeconds);
    });

    it("更新状态后 updatedAt 应该更新", async () => {
      // 创建测试 MCP
      const mcp = await McpDAO.create({
        name: "测试 MCP",
        transportType: "sse",
        url: "http://localhost:3000/sse",
        userId: adminUser.id,
      });

      const originalUpdatedAt = mcp.updatedAt;

      // 等待超过 1 秒
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // 更新状态
      await McpDAO.updateStatus(mcp.id, "connected");

      // 重新查询
      const updated = await McpDAO.findById(mcp.id);
      expect(updated).toBeDefined();
      // 使用秒级比较
      const originalSeconds = Math.floor(originalUpdatedAt.getTime() / 1000);
      const updatedSeconds = Math.floor(updated!.updatedAt.getTime() / 1000);
      expect(updatedSeconds).toBeGreaterThan(originalSeconds);
    });
  });

  describe("查询功能", () => {
    it("findAll 应按 createdAt 降序返回结果", async () => {
      // 创建多个 MCP，等待超过 1 秒确保 createdAt 不同（MySQL TIMESTAMP 精度为秒）
      await McpDAO.create({
        name: "MCP 1",
        transportType: "sse",
        url: "http://localhost:3000/sse1",
        userId: adminUser.id,
      });

      await new Promise((resolve) => setTimeout(resolve, 1100));

      await McpDAO.create({
        name: "MCP 2",
        transportType: "sse",
        url: "http://localhost:3000/sse2",
        userId: adminUser.id,
      });

      const list = await McpDAO.findAll();
      expect(list.length).toBe(2);
      // 最新创建的应该在前面
      expect(list[0].name).toBe("MCP 2");
      expect(list[1].name).toBe("MCP 1");
    });

    it("findAll 应支持关键词搜索", async () => {
      await McpDAO.create({
        name: "文件系统 MCP",
        description: "文件操作",
        transportType: "stdio",
        command: "npx",
        args: '["mcp-server"]',
        userId: adminUser.id,
      });

      await McpDAO.create({
        name: "网页搜索 MCP",
        description: "搜索引擎",
        transportType: "sse",
        url: "http://localhost:3000/sse",
        userId: adminUser.id,
      });

      // 按名称搜索
      const result1 = await McpDAO.findAll("文件");
      expect(result1.length).toBe(1);
      expect(result1[0].name).toBe("文件系统 MCP");

      // 按描述搜索
      const result2 = await McpDAO.findAll("搜索");
      expect(result2.length).toBe(1);
      expect(result2[0].name).toBe("网页搜索 MCP");
    });
  });
});

describe("McpForgeDAO", () => {
  describe("属性 2：删除级联完整性", () => {
    /**
     * 属性 2：删除级联完整性
     * 对于任何被删除的 MCP，其所有关联的 MCPForge 记录都应该被级联删除。
     * 验证：需求 5.1, 5.2
     */
    it("删除 MCP 时应级联删除所有 MCPForge 关联", async () => {
      // 创建测试 MCP
      const mcp = await McpDAO.create({
        name: "测试 MCP",
        transportType: "sse",
        url: "http://localhost:3000/sse",
        userId: adminUser.id,
      });

      // 创建测试 Forge
      const forge1 = await Agent.create({
        displayName: "测试 Forge 1",
        userId: normalUser.id,
      });
      const forge2 = await Agent.create({
        displayName: "测试 Forge 2",
        userId: normalUser.id,
      });

      // 创建关联
      await McpForgeDAO.create(mcp.id, forge1.id);
      await McpForgeDAO.create(mcp.id, forge2.id);

      // 验证关联已创建
      const countBefore = await McpForgeDAO.countByMcpId(mcp.id);
      expect(countBefore).toBe(2);

      // 删除 MCP（数据库级联删除会自动删除关联）
      await McpDAO.delete(mcp.id);

      // 验证关联已被级联删除
      const countAfter = await McpForgeDAO.countByMcpId(mcp.id);
      expect(countAfter).toBe(0);
    });

    it("deleteByMcpId 应删除 MCP 的所有关联", async () => {
      // 创建测试 MCP
      const mcp = await McpDAO.create({
        name: "测试 MCP",
        transportType: "sse",
        url: "http://localhost:3000/sse",
        userId: adminUser.id,
      });

      // 创建测试 Forge
      const forge1 = await Agent.create({
        displayName: "测试 Forge 1",
        userId: normalUser.id,
      });
      const forge2 = await Agent.create({
        displayName: "测试 Forge 2",
        userId: normalUser.id,
      });

      // 创建关联
      await McpForgeDAO.create(mcp.id, forge1.id);
      await McpForgeDAO.create(mcp.id, forge2.id);

      // 手动删除关联
      const deletedCount = await McpForgeDAO.deleteByMcpId(mcp.id);
      expect(deletedCount).toBe(2);

      // 验证关联已删除
      const count = await McpForgeDAO.countByMcpId(mcp.id);
      expect(count).toBe(0);
    });
  });

  describe("属性 3：Forge 列表可见性", () => {
    /**
     * 属性 3：Forge 列表可见性
     * 对于任何 MCP 详情页中显示的 Forge 列表，
     * 应该只包含当前用户可见范围内的 Forge。
     * 验证：需求 6.3
     */
    it("findByMcpIdAndUserId 应只返回用户可见的 Forge", async () => {
      // 创建测试 MCP
      const mcp = await McpDAO.create({
        name: "测试 MCP",
        transportType: "sse",
        url: "http://localhost:3000/sse",
        userId: adminUser.id,
      });

      // 创建不同可见性的 Forge
      const publicForge = await Agent.create({
        displayName: "公开 Forge",
        userId: adminUser.id,
        isPublic: true,
        isActive: true,
      });

      const privateForge = await Agent.create({
        displayName: "私有 Forge",
        userId: adminUser.id,
        isPublic: false,
        isActive: true,
      });

      const userOwnForge = await Agent.create({
        displayName: "用户自己的 Forge",
        userId: normalUser.id,
        isPublic: false,
        isActive: true,
      });

      const inactiveForge = await Agent.create({
        displayName: "已删除 Forge",
        userId: normalUser.id,
        isPublic: true,
        isActive: false,
      });

      // 创建关联
      await McpForgeDAO.create(mcp.id, publicForge.id);
      await McpForgeDAO.create(mcp.id, privateForge.id);
      await McpForgeDAO.create(mcp.id, userOwnForge.id);
      await McpForgeDAO.create(mcp.id, inactiveForge.id);

      // 普通用户查询
      const visibleForges = await McpForgeDAO.findByMcpIdAndUserId(mcp.id, normalUser.id);

      // 应该只能看到：公开的 + 自己创建的（且 isActive=true）
      expect(visibleForges.length).toBe(2);
      const forgeNames = visibleForges.map(
        (v) => (v as McpForge & { forge: Agent }).forge.displayName
      );
      expect(forgeNames).toContain("公开 Forge");
      expect(forgeNames).toContain("用户自己的 Forge");
      expect(forgeNames).not.toContain("私有 Forge");
      expect(forgeNames).not.toContain("已删除 Forge");
    });
  });

  describe("关联管理功能", () => {
    it("bulkCreate 应批量创建关联", async () => {
      const mcp1 = await McpDAO.create({
        name: "MCP 1",
        transportType: "sse",
        url: "http://localhost:3000/sse1",
        userId: adminUser.id,
      });
      const mcp2 = await McpDAO.create({
        name: "MCP 2",
        transportType: "sse",
        url: "http://localhost:3000/sse2",
        userId: adminUser.id,
      });

      const forge = await Agent.create({
        displayName: "测试 Forge",
        userId: normalUser.id,
      });

      await McpForgeDAO.bulkCreate([mcp1.id, mcp2.id], forge.id);

      const associations = await McpForgeDAO.findByForgeId(forge.id);
      expect(associations.length).toBe(2);
    });

    it("updateForgeAssociations 应更新 Forge 的 MCP 关联", async () => {
      const mcp1 = await McpDAO.create({
        name: "MCP 1",
        transportType: "sse",
        url: "http://localhost:3000/sse1",
        userId: adminUser.id,
      });
      const mcp2 = await McpDAO.create({
        name: "MCP 2",
        transportType: "sse",
        url: "http://localhost:3000/sse2",
        userId: adminUser.id,
      });
      const mcp3 = await McpDAO.create({
        name: "MCP 3",
        transportType: "sse",
        url: "http://localhost:3000/sse3",
        userId: adminUser.id,
      });

      const forge = await Agent.create({
        displayName: "测试 Forge",
        userId: normalUser.id,
      });

      // 初始关联 mcp1, mcp2
      await McpForgeDAO.bulkCreate([mcp1.id, mcp2.id], forge.id);

      // 更新为 mcp2, mcp3
      await McpForgeDAO.updateForgeAssociations(forge.id, [mcp2.id, mcp3.id]);

      const associations = await McpForgeDAO.findByForgeId(forge.id);
      expect(associations.length).toBe(2);
      const mcpIds = associations.map((a) => a.mcpId);
      expect(mcpIds).toContain(mcp2.id);
      expect(mcpIds).toContain(mcp3.id);
      expect(mcpIds).not.toContain(mcp1.id);
    });

    it("findNonPublicMcpsByForgeId 应返回非公开的 MCP 名称", async () => {
      // 注意：当前设计中所有 MCP 的 isPublic 都是 true
      // 这个测试主要验证方法的正确性
      const mcp = await McpDAO.create({
        name: "公开 MCP",
        transportType: "sse",
        url: "http://localhost:3000/sse",
        userId: adminUser.id,
      });

      const forge = await Agent.create({
        displayName: "测试 Forge",
        userId: normalUser.id,
      });

      await McpForgeDAO.create(mcp.id, forge.id);

      // 所有 MCP 都是公开的，应返回空数组
      const nonPublicMcps = await McpForgeDAO.findNonPublicMcpsByForgeId(forge.id);
      expect(nonPublicMcps.length).toBe(0);
    });
  });
});
