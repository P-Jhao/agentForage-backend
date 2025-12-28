/**
 * 登录记录数据访问对象
 */
import { Op } from "sequelize";
import { LoginLog } from "./models/index.js";

interface CreateLoginLogParams {
  userId: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

class LoginLogDAO {
  /**
   * 创建登录记录
   */
  static async create(params: CreateLoginLogParams): Promise<LoginLog> {
    return LoginLog.create({
      userId: params.userId,
      loginAt: new Date(),
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    });
  }

  /**
   * 按时间范围查询登录记录
   */
  static async findByTimeRange(startTime: Date, endTime: Date): Promise<LoginLog[]> {
    return LoginLog.findAll({
      where: {
        loginAt: {
          [Op.gte]: startTime,
          [Op.lte]: endTime,
        },
      },
      order: [["loginAt", "DESC"]],
    });
  }

  /**
   * 统计时间范围内的 PV（总登录次数）
   */
  static async countPV(startTime: Date, endTime: Date): Promise<number> {
    return LoginLog.count({
      where: {
        loginAt: {
          [Op.gte]: startTime,
          [Op.lte]: endTime,
        },
      },
    });
  }

  /**
   * 统计时间范围内的 UV（独立用户数）
   */
  static async countUV(startTime: Date, endTime: Date): Promise<number> {
    const result = await LoginLog.count({
      where: {
        loginAt: {
          [Op.gte]: startTime,
          [Op.lte]: endTime,
        },
      },
      distinct: true,
      col: "userId",
    });
    return result;
  }
}

export default LoginLogDAO;
