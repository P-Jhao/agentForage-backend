/**
 * 统计服务
 * 提供控制台数据统计功能
 */
import { Op, fn, col, literal } from "sequelize";
import { Conversation, Message, LoginLog } from "../dao/models/index.js";

// 时间范围类型
type TimeRangeType = "last24h" | "last7d" | "last30d" | "all" | "custom";

// 分组粒度
type Granularity = "hour" | "day";

// 统计查询参数
interface StatisticsQuery {
  range: TimeRangeType;
  startTime?: string;
  endTime?: string;
}

// 汇总数据
interface StatisticsSummary {
  taskCount: number;
  totalTokens: number;
  avgTokensPerTask: number;
  uv: number;
  pv: number;
}

// 趋势数据
interface StatisticsTrends {
  labels: string[];
  tasks: number[];
  tokens: number[];
  avgTokens: number[];
  uv: number[];
  pv: number[];
}

// 统计响应数据
interface StatisticsData {
  summary: StatisticsSummary;
  trends: StatisticsTrends;
}

class StatisticsService {
  /**
   * 根据 range 参数计算起止时间
   */
  static getTimeRange(
    range: TimeRangeType,
    startTime?: string,
    endTime?: string
  ): { start: Date; end: Date } {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (range) {
      case "last24h":
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "last7d":
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "last30d":
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "all":
        // 从系统最早记录开始，这里设置一个足够早的时间
        start = new Date("2020-01-01");
        break;
      case "custom":
        if (!startTime || !endTime) {
          throw Object.assign(new Error("自定义时间范围需要提供起止时间"), { status: 400 });
        }
        start = new Date(startTime);
        end = new Date(endTime);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw Object.assign(new Error("时间格式无效"), { status: 400 });
        }
        if (start > end) {
          throw Object.assign(new Error("开始时间不能晚于结束时间"), { status: 400 });
        }
        break;
      default:
        throw Object.assign(new Error("无效的时间范围参数"), { status: 400 });
    }

    return { start, end };
  }

  /**
   * 根据时间跨度选择分组粒度
   * - 24小时内：按小时分组
   * - 超过24小时：按天分组
   */
  static getGroupGranularity(start: Date, end: Date): Granularity {
    const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return diffHours <= 24 ? "hour" : "day";
  }

  /**
   * 生成时间标签数组
   */
  static generateTimeLabels(start: Date, end: Date, granularity: Granularity): string[] {
    const labels: string[] = [];
    const current = new Date(start);

    if (granularity === "hour") {
      // 按小时生成标签
      current.setMinutes(0, 0, 0);
      while (current <= end) {
        labels.push(this.formatTimeLabel(current, granularity));
        current.setHours(current.getHours() + 1);
      }
    } else {
      // 按天生成标签
      current.setHours(0, 0, 0, 0);
      while (current <= end) {
        labels.push(this.formatTimeLabel(current, granularity));
        current.setDate(current.getDate() + 1);
      }
    }

    return labels;
  }

  /**
   * 格式化时间标签
   */
  static formatTimeLabel(date: Date, granularity: Granularity): string {
    if (granularity === "hour") {
      return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:00`;
    }
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
  }

  /**
   * 获取时间分组的 SQL 表达式
   * 注意：数据库列名使用 snake_case
   */
  static getTimeGroupExpression(field: string, granularity: Granularity): string {
    // 将 camelCase 转换为 snake_case
    const dbField = field.replace(/([A-Z])/g, "_$1").toLowerCase();
    if (granularity === "hour") {
      return `DATE_FORMAT(${dbField}, '%m-%d %H:00')`;
    }
    return `DATE_FORMAT(${dbField}, '%Y-%m-%d')`;
  }

  /**
   * 获取任务统计
   */
  static async getTaskStats(
    start: Date,
    end: Date,
    granularity: Granularity,
    labels: string[]
  ): Promise<{ total: number; trend: number[] }> {
    // 查询总数

    const total = await Conversation.count({
      where: {
        createdAt: {
          [Op.gte]: start,
          [Op.lte]: end,
        },
      } as any,
    });

    // 查询趋势数据
    const timeGroup = this.getTimeGroupExpression("createdAt", granularity);

    const trendData = (await Conversation.findAll({
      attributes: [
        [literal(timeGroup), "timeLabel"],
        [fn("COUNT", col("id")), "count"],
      ],
      where: {
        createdAt: {
          [Op.gte]: start,
          [Op.lte]: end,
        },
      } as any,
      group: [literal(timeGroup)] as any,
      raw: true,
    })) as unknown as Array<{ timeLabel: string; count: number }>;

    // 将数据映射到标签数组
    const trendMap = new Map(trendData.map((d) => [d.timeLabel, Number(d.count)]));
    const trend = labels.map((label) => trendMap.get(label) || 0);

    return { total, trend };
  }

  /**
   * 获取 Token 统计
   * 从 turn_end 类型的消息中解析 accumulatedTokens
   */
  static async getTokenStats(
    start: Date,
    end: Date,
    granularity: Granularity,
    labels: string[]
  ): Promise<{ total: number; avgPerTask: number; trend: number[]; avgTrend: number[] }> {
    // 查询时间范围内的所有 turn_end 消息

    const turnEndMessages = await Message.findAll({
      attributes: ["conversationId", "content", "createdAt"],
      where: {
        type: "turn_end",
        createdAt: {
          [Op.gte]: start,
          [Op.lte]: end,
        },
      } as any,
      order: [["createdAt", "DESC"]],
      raw: true,
    });

    // 按 conversationId 分组，取每个任务的最新 turn_end 记录
    const latestByConversation = new Map<number, { tokens: number; createdAt: Date }>();
    for (const msg of turnEndMessages) {
      if (!latestByConversation.has(msg.conversationId)) {
        try {
          const data = JSON.parse(msg.content);
          const tokens = data.accumulatedTokens?.totalTokens || 0;
          latestByConversation.set(msg.conversationId, {
            tokens,
            createdAt: new Date(msg.createdAt),
          });
        } catch {
          latestByConversation.set(msg.conversationId, {
            tokens: 0,
            createdAt: new Date(msg.createdAt),
          });
        }
      }
    }

    // 计算总 Token
    let total = 0;
    for (const { tokens } of latestByConversation.values()) {
      total += tokens;
    }

    // 计算平均 Token
    const taskCount = latestByConversation.size;
    const avgPerTask = taskCount > 0 ? Math.round(total / taskCount) : 0;

    // 按时间分组计算趋势
    const trendMap = new Map<string, { tokens: number; count: number }>();
    for (const { tokens, createdAt } of latestByConversation.values()) {
      const label = this.formatTimeLabel(createdAt, granularity);
      const existing = trendMap.get(label) || { tokens: 0, count: 0 };
      trendMap.set(label, {
        tokens: existing.tokens + tokens,
        count: existing.count + 1,
      });
    }

    const trend = labels.map((label) => trendMap.get(label)?.tokens || 0);
    const avgTrend = labels.map((label) => {
      const data = trendMap.get(label);
      if (!data || data.count === 0) return 0;
      return Math.round(data.tokens / data.count);
    });

    return { total, avgPerTask, trend, avgTrend };
  }

  /**
   * 获取登录统计（UV/PV）
   */
  static async getLoginStats(
    start: Date,
    end: Date,
    granularity: Granularity,
    labels: string[]
  ): Promise<{ uv: number; pv: number; uvTrend: number[]; pvTrend: number[] }> {
    // 查询总 PV

    const pv = await LoginLog.count({
      where: {
        loginAt: {
          [Op.gte]: start,
          [Op.lte]: end,
        },
      } as any,
    });

    // 查询总 UV

    const uv = (await LoginLog.count({
      where: {
        loginAt: {
          [Op.gte]: start,
          [Op.lte]: end,
        },
      } as any,
      distinct: true,
      col: "user_id",
    })) as unknown as number;

    // 查询 PV 趋势
    const timeGroup = this.getTimeGroupExpression("loginAt", granularity);

    const pvTrendData = (await LoginLog.findAll({
      attributes: [
        [literal(timeGroup), "timeLabel"],
        [fn("COUNT", col("id")), "count"],
      ],
      where: {
        loginAt: {
          [Op.gte]: start,
          [Op.lte]: end,
        },
      } as any,
      group: [literal(timeGroup)] as any,
      raw: true,
    })) as unknown as Array<{ timeLabel: string; count: number }>;

    // 查询 UV 趋势

    const uvTrendData = (await LoginLog.findAll({
      attributes: [
        [literal(timeGroup), "timeLabel"],
        [fn("COUNT", fn("DISTINCT", col("user_id"))), "count"],
      ],
      where: {
        loginAt: {
          [Op.gte]: start,
          [Op.lte]: end,
        },
      } as any,
      group: [literal(timeGroup)] as any,
      raw: true,
    })) as unknown as Array<{ timeLabel: string; count: number }>;

    // 映射到标签数组
    const pvMap = new Map(pvTrendData.map((d) => [d.timeLabel, Number(d.count)]));
    const uvMap = new Map(uvTrendData.map((d) => [d.timeLabel, Number(d.count)]));

    const pvTrend = labels.map((label) => pvMap.get(label) || 0);
    const uvTrend = labels.map((label) => uvMap.get(label) || 0);

    return { uv, pv, uvTrend, pvTrend };
  }

  /**
   * 获取完整统计数据
   */
  static async getStatistics(query: StatisticsQuery): Promise<StatisticsData> {
    // 计算时间范围
    const { start, end } = this.getTimeRange(query.range, query.startTime, query.endTime);

    // 确定分组粒度
    const granularity = this.getGroupGranularity(start, end);

    // 生成时间标签
    const labels = this.generateTimeLabels(start, end, granularity);

    // 并行获取各项统计数据
    const [taskStats, tokenStats, loginStats] = await Promise.all([
      this.getTaskStats(start, end, granularity, labels),
      this.getTokenStats(start, end, granularity, labels),
      this.getLoginStats(start, end, granularity, labels),
    ]);

    return {
      summary: {
        taskCount: taskStats.total,
        totalTokens: tokenStats.total,
        avgTokensPerTask: tokenStats.avgPerTask,
        uv: loginStats.uv,
        pv: loginStats.pv,
      },
      trends: {
        labels,
        tasks: taskStats.trend,
        tokens: tokenStats.trend,
        avgTokens: tokenStats.avgTrend,
        uv: loginStats.uvTrend,
        pv: loginStats.pvTrend,
      },
    };
  }
}

export default StatisticsService;
export type { StatisticsQuery, StatisticsData, StatisticsSummary, StatisticsTrends };
