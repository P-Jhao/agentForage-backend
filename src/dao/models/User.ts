/**
 * 用户模型
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

// 自定义模型配置类型
interface CustomModelConfig {
  mode: "builtin" | "custom"; // 模式：系统内置 / 自定义
  baseUrl?: string; // API 地址
  apiKey?: string; // API 密钥
  model?: string; // 模型名称
  maxTokens?: number; // 最大 token 数
  temperature?: number; // 温度参数
}

interface UserAttributes {
  id: number;
  username: string; // 账号，登录用，唯一
  nickname: string; // 名称，显示用，可修改
  password: string;
  avatar: string | null; // 头像 URL
  email: string | null; // 邮箱
  apiQuota: number;
  role: "user" | "premium" | "root" | "operator"; // 用户角色：普通用户 / 高级用户 / 超级管理员 / 平台运营员
  modelConfig: CustomModelConfig | null; // 自定义模型配置
  adminNote: string | null; // 管理员备注（仅 operator 可见）
  lastLoginAt: Date | null; // 最近登录时间
  isDeleted: boolean; // 软删除标记
}

type UserCreationAttributes = Optional<
  UserAttributes,
  | "id"
  | "nickname"
  | "avatar"
  | "email"
  | "apiQuota"
  | "role"
  | "modelConfig"
  | "adminNote"
  | "lastLoginAt"
  | "isDeleted"
>;

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: number;
  declare username: string;
  declare nickname: string;
  declare password: string;
  declare avatar: string | null;
  declare email: string | null;
  declare apiQuota: number;
  declare role: "user" | "premium" | "root" | "operator";
  declare modelConfig: CustomModelConfig | null;
  declare adminNote: string | null;
  declare lastLoginAt: Date | null;
  declare isDeleted: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: "账号（登录用，唯一）",
    },
    nickname: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "",
      comment: "名称（显示用，可修改）",
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "密码（加密）",
    },
    avatar: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      comment: "头像 URL",
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
      comment: "邮箱",
    },
    apiQuota: {
      type: DataTypes.INTEGER,
      defaultValue: 1000,
      comment: "API 调用配额",
    },
    role: {
      type: DataTypes.ENUM("user", "premium", "root", "operator"),
      defaultValue: "user",
      comment: "用户角色：user 普通用户 / premium 高级用户 / root 超级管理员 / operator 平台运营员",
    },
    modelConfig: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: "自定义模型配置（JSON）",
    },
    adminNote: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: "管理员备注（仅 operator 可见）",
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      comment: "最近登录时间",
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "软删除标记",
    },
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true,
  }
);

export default User;
export type { CustomModelConfig };
