/**
 * 数据库配置与连接
 */
import "dotenv/config";
import { Sequelize } from "sequelize";
import bcrypt from "bcryptjs";

const sequelize = new Sequelize(
  process.env.DB_NAME || "agentforge",
  process.env.DB_USER || "root",
  process.env.DB_PASSWORD || "",
  {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    dialect: "mysql",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    timezone: "+08:00",
    define: {
      underscored: true,
      freezeTableName: true,
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

// 测试数据库连接
export const testConnection = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log("✅ 数据库连接成功");
  } catch (error) {
    console.error("❌ 数据库连接失败:", (error as Error).message);
  }
};

/**
 * 初始化超级管理员账号
 * 在数据库同步后调用，如果不存在则创建
 */
export const initSuperAdmin = async (): Promise<void> => {
  try {
    // 动态导入 User 模型，避免循环依赖
    const { User } = await import("../dao/models/index.js");

    // 检查是否已存在 superAdmin 账号
    const existing = await User.findOne({ where: { username: "superAdmin" } });
    if (existing) {
      console.log("ℹ️  superAdmin 账号已存在");
      return;
    }

    // 创建 superAdmin 账号
    const hashedPassword = await bcrypt.hash("superAdmin", 10);
    await User.create({
      username: "superAdmin",
      password: hashedPassword,
      role: "root",
    });
    console.log("✅ superAdmin 账号创建成功");
  } catch (error) {
    console.error("❌ 初始化 superAdmin 失败:", (error as Error).message);
  }
};

export { sequelize };
