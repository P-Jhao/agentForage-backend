/**
 * 数据库迁移脚本：添加 deleted 状态到 conversations 表
 *
 * 运行方式：npx tsx src/scripts/add-deleted-status.ts
 */
import "dotenv/config";
import { sequelize } from "../config/database.js";

async function migrate() {
  try {
    console.log("开始迁移：添加 deleted 状态...");

    // 修改 status 字段的 ENUM 类型，添加 deleted 选项
    await sequelize.query(`
      ALTER TABLE conversations 
      MODIFY COLUMN status ENUM('running', 'completed', 'cancelled', 'waiting', 'deleted') 
      DEFAULT 'running' 
      COMMENT '任务状态：running-运行中, completed-已完成, cancelled-已取消, waiting-等待用户回复, deleted-已删除'
    `);

    console.log("✅ 迁移完成：status 字段已添加 deleted 选项");
  } catch (error) {
    console.error("❌ 迁移失败:", error);
  } finally {
    await sequelize.close();
  }
}

migrate();
