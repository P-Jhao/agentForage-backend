/**
 * 数据库迁移脚本：为 users 表添加成员管理相关字段
 *
 * 新增字段：
 * - adminNote: 管理员备注（仅 operator 可见）
 * - lastLoginAt: 最近登录时间
 * - isDeleted: 软删除标记
 * - role 新增 premium 选项
 *
 * 运行方式：npx tsx src/scripts/add-user-member-fields.ts
 */
import "dotenv/config";
import { sequelize } from "../config/database.js";

async function migrate() {
  try {
    console.log("开始迁移：添加用户成员管理字段...");

    // 1. 修改 role 字段的 ENUM 类型，添加 premium 选项
    console.log("1. 修改 role 字段，添加 premium 选项...");
    await sequelize.query(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('user', 'premium', 'root', 'operator') 
      DEFAULT 'user' 
      COMMENT '用户角色：user 普通用户 / premium 高级用户 / root 超级管理员 / operator 平台运营员'
    `);
    console.log("   ✅ role 字段已更新");

    // 2. 添加 adminNote 字段
    console.log("2. 添加 adminNote 字段...");
    try {
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN adminNote VARCHAR(500) DEFAULT NULL 
        COMMENT '管理员备注（仅 operator 可见）'
      `);
      console.log("   ✅ adminNote 字段已添加");
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("Duplicate column")) {
        console.log("   ⏭️ adminNote 字段已存在，跳过");
      } else {
        throw error;
      }
    }

    // 3. 添加 lastLoginAt 字段
    console.log("3. 添加 lastLoginAt 字段...");
    try {
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN lastLoginAt DATETIME DEFAULT NULL 
        COMMENT '最近登录时间'
      `);
      console.log("   ✅ lastLoginAt 字段已添加");
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("Duplicate column")) {
        console.log("   ⏭️ lastLoginAt 字段已存在，跳过");
      } else {
        throw error;
      }
    }

    // 4. 添加 isDeleted 字段
    console.log("4. 添加 isDeleted 字段...");
    try {
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN isDeleted TINYINT(1) DEFAULT 0 
        COMMENT '软删除标记'
      `);
      console.log("   ✅ isDeleted 字段已添加");
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("Duplicate column")) {
        console.log("   ⏭️ isDeleted 字段已存在，跳过");
      } else {
        throw error;
      }
    }

    console.log("\n✅ 迁移完成！");
  } catch (error) {
    console.error("❌ 迁移失败:", error);
  } finally {
    await sequelize.close();
  }
}

migrate();
