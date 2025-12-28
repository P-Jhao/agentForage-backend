/**
 * 数据库迁移脚本：创建 login_logs 表
 *
 * 用于记录用户登录行为，统计 UV/PV
 *
 * 运行方式：npx tsx src/scripts/add-login-log-table.ts
 */
import "dotenv/config";
import { sequelize } from "../config/database.js";

async function migrate() {
  try {
    console.log("开始迁移：创建 login_logs 表...");

    // 1. 创建 login_logs 表
    console.log("1. 创建 login_logs 表...");
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS login_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          userId INT NOT NULL COMMENT '用户 ID',
          loginAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间',
          ipAddress VARCHAR(45) DEFAULT NULL COMMENT 'IP 地址（支持 IPv6）',
          userAgent VARCHAR(500) DEFAULT NULL COMMENT '浏览器 User-Agent',
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
          INDEX idx_login_logs_user_id (userId),
          INDEX idx_login_logs_login_at (loginAt),
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录记录表'
      `);
      console.log("   ✅ login_logs 表已创建");
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("already exists")) {
        console.log("   ⏭️ login_logs 表已存在，跳过");
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
