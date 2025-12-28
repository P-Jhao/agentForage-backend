/**
 * 登录记录模型
 * 存储用户每次登录的记录，用于统计 UV/PV
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

interface LoginLogAttributes {
  id: number;
  userId: number;
  loginAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

type LoginLogCreationAttributes = Optional<LoginLogAttributes, "id" | "ipAddress" | "userAgent">;

class LoginLog
  extends Model<LoginLogAttributes, LoginLogCreationAttributes>
  implements LoginLogAttributes
{
  declare id: number;
  declare userId: number;
  declare loginAt: Date;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare readonly createdAt: Date;
}

LoginLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "用户 ID",
    },
    loginAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "登录时间",
    },
    ipAddress: {
      type: DataTypes.STRING(45), // 支持 IPv6
      allowNull: true,
      defaultValue: null,
      comment: "IP 地址",
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: "浏览器 User-Agent",
    },
  },
  {
    sequelize,
    tableName: "login_logs",
    timestamps: true,
    updatedAt: false, // 登录记录不需要 updatedAt
    indexes: [
      {
        name: "idx_login_logs_user_id",
        fields: ["user_id"],
      },
      {
        name: "idx_login_logs_login_at",
        fields: ["login_at"],
      },
    ],
  }
);

export default LoginLog;
