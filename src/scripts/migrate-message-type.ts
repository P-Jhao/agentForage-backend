/**
 * 迁移脚本：为 messages 表的 type 字段添加 summary 类型
 *
 * 运行方式：pnpm tsx src/scripts/migrate-message-type.ts
 */
import { sequelize } from "../config/database.js";

async function migrate() {
  try {
    console.log("🔄 开始迁移 messages 表的 type 字段...");

    // 修改 ENUM 类型，添加 summary
    await sequelize.query(`
      ALTER TABLE messages 
      MODIFY COLUMN type ENUM('chat', 'thinking', 'tool_call', 'summary', 'error') 
      NOT NULL DEFAULT 'chat'
    `);

    console.log("✅ 迁移完成：type 字段已支持 summary 类型");
  } catch (error) {
    // 如果 ENUM 已经包含 summary，可能会报错，忽略即可
    const errMsg = (error as Error).message;
    if (errMsg.includes("Duplicate")) {
      console.log("ℹ️ type 字段已包含 summary 类型，无需迁移");
    } else {
      console.error("❌ 迁移失败:", errMsg);
    }
  } finally {
    await sequelize.close();
  }
}

migrate();
