/**
 * 迁移脚本：为 conversations 表添加 waiting 状态
 * 运行方式：pnpm tsx src/scripts/add-waiting-status.ts
 */
import { sequelize } from "../config/database.js";

async function migrate() {
  try {
    console.log("开始迁移：添加 waiting 状态到 conversations.status...");

    // 修改 ENUM 类型，添加 waiting 状态
    await sequelize.query(`
      ALTER TABLE conversations 
      MODIFY COLUMN status ENUM('running', 'completed', 'cancelled', 'waiting') 
      DEFAULT 'running' 
      COMMENT '任务状态：running-运行中, completed-已完成, cancelled-已取消, waiting-等待用户回复'
    `);

    console.log("迁移完成！");
    process.exit(0);
  } catch (error) {
    console.error("迁移失败:", error);
    process.exit(1);
  }
}

migrate();
