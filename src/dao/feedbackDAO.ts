/**
 * 反馈数据访问对象
 * 处理用户反馈的 CRUD 操作
 */
import { Op, literal } from "sequelize";
import { Feedback, Conversation, User, Message } from "./models/index.js";
import type { FeedbackType } from "./models/Feedback.js";

// 创建反馈参数
interface CreateFeedbackData {
  taskId: number;
  turnEndMessageId: number;
  userId: number;
  type: FeedbackType;
  tags?: string[];
  content?: string;
}

// 后台列表查询参数
interface FindAllWithFiltersParams {
  page: number;
  pageSize: number;
  taskKeyword?: string;
  userKeyword?: string;
  taskStartTime?: Date;
  taskEndTime?: Date;
  feedbackType?: "all" | "like" | "dislike" | "cancel";
  feedbackStartTime?: Date;
  feedbackEndTime?: Date;
}

// 后台列表返回项
interface FeedbackListItem {
  id: number;
  task: {
    uuid: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
  };
  user: {
    id: number;
    username: string;
    nickname: string;
  };
  type: FeedbackType;
  tags: string[];
  content: string | null;
  createdAt: Date;
}

class FeedbackDAO {
  /**
   * 创建反馈记录
   * 每次提交都创建新记录（保留历史）
   */
  static async create(data: CreateFeedbackData) {
    return await Feedback.create({
      taskId: data.taskId,
      turnEndMessageId: data.turnEndMessageId,
      userId: data.userId,
      type: data.type,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      content: data.content || null,
    });
  }

  /**
   * 获取指定轮次的最新反馈
   * @param turnEndMessageId 轮次结束消息 ID
   * @param userId 用户 ID
   * @returns 最新的反馈记录，如果不存在返回 null
   */
  static async findLatestByTurnEndMessageId(
    turnEndMessageId: number,
    userId: number
  ): Promise<Feedback | null> {
    return await Feedback.findOne({
      where: {
        turnEndMessageId,
        userId,
      },
      order: [["createdAt", "DESC"]],
    });
  }

  /**
   * 批量获取多个轮次的最新反馈状态
   * @param turnEndMessageIds 轮次结束消息 ID 数组
   * @param userId 用户 ID
   * @returns Map，key 为 turnEndMessageId，value 为最新反馈类型（cancel 视为 null）
   */
  static async findLatestByTurnEndMessageIds(
    turnEndMessageIds: number[],
    userId: number
  ): Promise<Record<number, "like" | "dislike" | null>> {
    if (turnEndMessageIds.length === 0) {
      return {};
    }

    // 使用子查询获取每个 turnEndMessageId 的最新反馈
    // 先获取每个 turnEndMessageId 的最新记录 ID
    // 注意：原生 SQL 中使用数据库列名（snake_case）
    const latestFeedbacks = await Feedback.findAll({
      where: {
        turnEndMessageId: { [Op.in]: turnEndMessageIds },
        userId,
        // 使用子查询确保获取最新记录
        id: {
          [Op.in]: literal(`(
            SELECT MAX(f2.id) FROM feedbacks f2 
            WHERE f2.turn_end_message_id = Feedback.turn_end_message_id 
            AND f2.user_id = ${userId}
            GROUP BY f2.turn_end_message_id
          )`),
        },
      },
    });

    // 构建结果 Map
    const result: Record<number, "like" | "dislike" | null> = {};

    // 初始化所有 ID 为 null
    for (const id of turnEndMessageIds) {
      result[id] = null;
    }

    // 填充实际值（cancel 视为 null）
    for (const feedback of latestFeedbacks) {
      if (feedback.type === "cancel") {
        result[feedback.turnEndMessageId] = null;
      } else {
        result[feedback.turnEndMessageId] = feedback.type as "like" | "dislike";
      }
    }

    return result;
  }

  /**
   * 后台列表查询（支持多种筛选条件）
   */
  static async findAllWithFilters(
    params: FindAllWithFiltersParams
  ): Promise<{ feedbacks: FeedbackListItem[]; total: number }> {
    const { page, pageSize } = params;
    const offset = (page - 1) * pageSize;

    // 构建反馈表的查询条件
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feedbackWhere: any = {};

    // 反馈类型筛选
    if (params.feedbackType && params.feedbackType !== "all") {
      feedbackWhere.type = params.feedbackType;
    }

    // 反馈时间范围筛选
    if (params.feedbackStartTime || params.feedbackEndTime) {
      feedbackWhere.createdAt = {};
      if (params.feedbackStartTime) {
        feedbackWhere.createdAt[Op.gte] = params.feedbackStartTime;
      }
      if (params.feedbackEndTime) {
        feedbackWhere.createdAt[Op.lte] = params.feedbackEndTime;
      }
    }

    // 构建任务表的查询条件
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskWhere: any = {};

    // 任务名称模糊搜索
    if (params.taskKeyword) {
      taskWhere.title = { [Op.like]: `%${params.taskKeyword}%` };
    }

    // 任务时间范围筛选
    if (params.taskStartTime || params.taskEndTime) {
      taskWhere.createdAt = {};
      if (params.taskStartTime) {
        taskWhere.createdAt[Op.gte] = params.taskStartTime;
      }
      if (params.taskEndTime) {
        taskWhere.createdAt[Op.lte] = params.taskEndTime;
      }
    }

    // 构建用户表的查询条件
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userWhere: any = {};

    // 反馈人模糊搜索（用户名或昵称）
    if (params.userKeyword) {
      userWhere[Op.or] = [
        { username: { [Op.like]: `%${params.userKeyword}%` } },
        { nickname: { [Op.like]: `%${params.userKeyword}%` } },
      ];
    }

    // 查询总数和数据
    const { count, rows } = await Feedback.findAndCountAll({
      where: feedbackWhere,
      include: [
        {
          model: Conversation,
          as: "task",
          attributes: ["uuid", "title", "createdAt", "updatedAt"],
          where: Object.keys(taskWhere).length > 0 ? taskWhere : undefined,
          required: true,
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "username", "nickname"],
          where: Object.keys(userWhere).length > 0 ? userWhere : undefined,
          required: true,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: pageSize,
      offset,
      subQuery: false, // 关联表字段搜索需要禁用子查询
    });

    // 转换为返回格式
    const feedbacks: FeedbackListItem[] = rows.map((feedback) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const task = (feedback as any).task;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (feedback as any).user;

      return {
        id: feedback.id,
        task: {
          uuid: task.uuid,
          title: task.title,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        },
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
        },
        type: feedback.type,
        tags: feedback.getParsedTags(),
        content: feedback.content,
        createdAt: feedback.createdAt,
      };
    });

    return { feedbacks, total: count };
  }

  /**
   * 统计用户在指定时间范围内的反馈次数
   * 用于节流控制
   */
  static async countByUserInTimeRange(
    userId: number,
    startTime: Date,
    endTime: Date
  ): Promise<number> {
    return await Feedback.count({
      where: {
        userId,
        createdAt: {
          [Op.gte]: startTime,
          [Op.lte]: endTime,
        },
      },
    });
  }

  /**
   * 验证 turnEndMessageId 是否属于指定任务
   */
  static async validateTurnEndMessage(turnEndMessageId: number, taskId: number): Promise<boolean> {
    const message = await Message.findOne({
      where: {
        id: turnEndMessageId,
        conversationId: taskId,
        type: "turn_end",
      },
    });
    return message !== null;
  }
}

export default FeedbackDAO;
export type { CreateFeedbackData, FindAllWithFiltersParams, FeedbackListItem };
