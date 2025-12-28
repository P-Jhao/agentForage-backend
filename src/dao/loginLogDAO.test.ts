/**
 * LoginLogDAO 单元测试
 * 测试登录记录的创建和查询功能
 *
 * Property 1: 登录记录创建规则
 * - 密码登录成功时应创建登录记录
 * - Token 验证不应创建登录记录（由 userService 控制，此处测试 DAO 层）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock LoginLog 模型
vi.mock("./models/index.js", () => ({
  LoginLog: {
    create: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
  },
}));

import LoginLogDAO from "./loginLogDAO.js";
import { LoginLog } from "./models/index.js";

describe("LoginLogDAO", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("应该创建登录记录并返回创建的记录", async () => {
      const mockLoginLog = {
        id: 1,
        userId: 123,
        loginAt: new Date(),
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      };

      vi.mocked(LoginLog.create).mockResolvedValue(mockLoginLog as any);

      const result = await LoginLogDAO.create({
        userId: 123,
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });

      expect(LoginLog.create).toHaveBeenCalledWith({
        userId: 123,
        loginAt: expect.any(Date),
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });
      expect(result).toEqual(mockLoginLog);
    });

    it("应该处理可选参数为 null 的情况", async () => {
      const mockLoginLog = {
        id: 2,
        userId: 456,
        loginAt: new Date(),
        ipAddress: null,
        userAgent: null,
      };

      vi.mocked(LoginLog.create).mockResolvedValue(mockLoginLog as any);

      const result = await LoginLogDAO.create({
        userId: 456,
      });

      expect(LoginLog.create).toHaveBeenCalledWith({
        userId: 456,
        loginAt: expect.any(Date),
        ipAddress: null,
        userAgent: null,
      });
      expect(result).toEqual(mockLoginLog);
    });
  });

  describe("findByTimeRange", () => {
    it("应该按时间范围查询登录记录", async () => {
      const startTime = new Date("2024-01-01");
      const endTime = new Date("2024-01-31");
      const mockLogs = [
        { id: 1, userId: 1, loginAt: new Date("2024-01-15") },
        { id: 2, userId: 2, loginAt: new Date("2024-01-20") },
      ];

      vi.mocked(LoginLog.findAll).mockResolvedValue(mockLogs as any);

      const result = await LoginLogDAO.findByTimeRange(startTime, endTime);

      // 验证调用了 findAll
      expect(LoginLog.findAll).toHaveBeenCalled();
      // 验证返回结果
      expect(result).toEqual(mockLogs);
    });
  });

  describe("countPV", () => {
    it("应该统计时间范围内的总登录次数", async () => {
      const startTime = new Date("2024-01-01");
      const endTime = new Date("2024-01-31");

      vi.mocked(LoginLog.count).mockResolvedValue(100);

      const result = await LoginLogDAO.countPV(startTime, endTime);

      expect(LoginLog.count).toHaveBeenCalled();
      expect(result).toBe(100);
    });
  });

  describe("countUV", () => {
    it("应该统计时间范围内的独立用户数", async () => {
      const startTime = new Date("2024-01-01");
      const endTime = new Date("2024-01-31");

      vi.mocked(LoginLog.count).mockResolvedValue(50);

      const result = await LoginLogDAO.countUV(startTime, endTime);

      expect(LoginLog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          distinct: true,
          col: "userId",
        })
      );
      expect(result).toBe(50);
    });
  });
});
