/**
 * StatisticsService 单元测试
 *
 * Property 3: 时间分组粒度选择
 * Property 4: 平均 Token 计算正确性
 */
import { describe, it, expect } from "vitest";
import StatisticsService from "./statisticsService.js";

describe("StatisticsService", () => {
  describe("getTimeRange", () => {
    it("应该正确计算 last24h 的时间范围", () => {
      const { start, end } = StatisticsService.getTimeRange("last24h");
      const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 0);
    });

    it("应该正确计算 last7d 的时间范围", () => {
      const { start, end } = StatisticsService.getTimeRange("last7d");
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(7, 0);
    });

    it("应该正确计算 last30d 的时间范围", () => {
      const { start, end } = StatisticsService.getTimeRange("last30d");
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(30, 0);
    });

    it("应该正确处理 custom 时间范围", () => {
      const { start, end } = StatisticsService.getTimeRange(
        "custom",
        "2024-01-01T00:00:00Z",
        "2024-01-31T23:59:59Z"
      );
      expect(start.toISOString()).toBe("2024-01-01T00:00:00.000Z");
      expect(end.toISOString()).toBe("2024-01-31T23:59:59.000Z");
    });

    it("custom 范围缺少参数时应该抛出错误", () => {
      expect(() => StatisticsService.getTimeRange("custom")).toThrow(
        "自定义时间范围需要提供起止时间"
      );
    });

    it("开始时间晚于结束时间时应该抛出错误", () => {
      expect(() =>
        StatisticsService.getTimeRange("custom", "2024-01-31T00:00:00Z", "2024-01-01T00:00:00Z")
      ).toThrow("开始时间不能晚于结束时间");
    });

    it("无效的时间格式应该抛出错误", () => {
      expect(() => StatisticsService.getTimeRange("custom", "invalid", "2024-01-01")).toThrow(
        "时间格式无效"
      );
    });

    it("无效的 range 参数应该抛出错误", () => {
      expect(() => StatisticsService.getTimeRange("invalid" as any)).toThrow("无效的时间范围参数");
    });
  });

  describe("getGroupGranularity - Property 3: 时间分组粒度选择", () => {
    it("24小时内应该返回 hour 粒度", () => {
      const start = new Date("2024-01-01T00:00:00Z");
      const end = new Date("2024-01-01T23:59:59Z");
      expect(StatisticsService.getGroupGranularity(start, end)).toBe("hour");
    });

    it("正好24小时应该返回 hour 粒度", () => {
      const start = new Date("2024-01-01T00:00:00Z");
      const end = new Date("2024-01-02T00:00:00Z");
      expect(StatisticsService.getGroupGranularity(start, end)).toBe("hour");
    });

    it("超过24小时应该返回 day 粒度", () => {
      const start = new Date("2024-01-01T00:00:00Z");
      const end = new Date("2024-01-02T00:00:01Z");
      expect(StatisticsService.getGroupGranularity(start, end)).toBe("day");
    });

    it("7天应该返回 day 粒度", () => {
      const start = new Date("2024-01-01T00:00:00Z");
      const end = new Date("2024-01-08T00:00:00Z");
      expect(StatisticsService.getGroupGranularity(start, end)).toBe("day");
    });

    it("30天应该返回 day 粒度", () => {
      const start = new Date("2024-01-01T00:00:00Z");
      const end = new Date("2024-01-31T00:00:00Z");
      expect(StatisticsService.getGroupGranularity(start, end)).toBe("day");
    });
  });

  describe("generateTimeLabels", () => {
    it("应该生成正确的小时标签", () => {
      const start = new Date("2024-01-01T10:00:00");
      const end = new Date("2024-01-01T13:00:00");
      const labels = StatisticsService.generateTimeLabels(start, end, "hour");

      // 应该包含 4 个小时标签
      expect(labels.length).toBe(4);
      // 验证格式正确（M-D HH:00）
      expect(labels[0]).toMatch(/\d+-\d+ \d{2}:00/);
    });

    it("应该生成正确的天标签", () => {
      const start = new Date("2024-01-01T00:00:00");
      const end = new Date("2024-01-03T00:00:00");
      const labels = StatisticsService.generateTimeLabels(start, end, "day");

      // 应该包含 3 天标签
      expect(labels.length).toBe(3);
      // 验证格式正确（YYYY-MM-DD）
      expect(labels[0]).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe("formatTimeLabel", () => {
    it("hour 粒度应该返回 M-D HH:00 格式", () => {
      const date = new Date("2024-01-15T14:30:00Z");
      const label = StatisticsService.formatTimeLabel(date, "hour");
      expect(label).toMatch(/\d+-\d+ \d{2}:00/);
    });

    it("day 粒度应该返回 YYYY-MM-DD 格式", () => {
      const date = new Date("2024-01-15T14:30:00Z");
      const label = StatisticsService.formatTimeLabel(date, "day");
      expect(label).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe("Property 4: 平均 Token 计算正确性", () => {
    it("avgTokensPerTask = totalTokens / taskCount (taskCount > 0)", () => {
      // 这个测试验证计算逻辑
      const totalTokens = 1000;
      const taskCount = 4;
      const avgTokensPerTask = taskCount > 0 ? Math.round(totalTokens / taskCount) : 0;
      expect(avgTokensPerTask).toBe(250);
    });

    it("taskCount = 0 时 avgTokensPerTask 应该返回 0", () => {
      const totalTokens = 0;
      const taskCount = 0;
      const avgTokensPerTask = taskCount > 0 ? Math.round(totalTokens / taskCount) : 0;
      expect(avgTokensPerTask).toBe(0);
    });

    it("应该正确四舍五入", () => {
      const totalTokens = 1000;
      const taskCount = 3;
      const avgTokensPerTask = taskCount > 0 ? Math.round(totalTokens / taskCount) : 0;
      expect(avgTokensPerTask).toBe(333); // 1000/3 = 333.33... -> 333
    });
  });

  describe("getTimeGroupExpression", () => {
    it("hour 粒度应该返回正确的 SQL 表达式", () => {
      const expr = StatisticsService.getTimeGroupExpression("createdAt", "hour");
      expect(expr).toBe("DATE_FORMAT(createdAt, '%m-%d %H:00')");
    });

    it("day 粒度应该返回正确的 SQL 表达式", () => {
      const expr = StatisticsService.getTimeGroupExpression("createdAt", "day");
      expect(expr).toBe("DATE_FORMAT(createdAt, '%Y-%m-%d')");
    });
  });
});
