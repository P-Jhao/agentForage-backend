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
  username: string;
  password: string;
  apiQuota: number;
  role: "user" | "root"; // 用户角色：普通用户 / 超级管理员
  modelConfig: CustomModelConfig | null; // 自定义模型配置
}

type UserCreationAttributes = Optional<UserAttributes, "id" | "apiQuota" | "role" | "modelConfig">;

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: number;
  declare username: string;
  declare password: string;
  declare apiQuota: number;
  declare role: "user" | "root";
  declare modelConfig: CustomModelConfig | null;
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
      comment: "用户名",
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "密码（加密）",
    },
    apiQuota: {
      type: DataTypes.INTEGER,
      defaultValue: 1000,
      comment: "API 调用配额",
    },
    role: {
      type: DataTypes.ENUM("user", "root"),
      defaultValue: "user",
      comment: "用户角色：user 普通用户 / root 超级管理员",
    },
    modelConfig: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: "自定义模型配置（JSON）",
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
