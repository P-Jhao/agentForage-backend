/**
 * 移除 messages 表的 type 字段
 * 运行: npx tsx src/scripts/remove-message-type-field.ts
 *
 * 原因：设计变更，type 信息现在存储在 assistant 消息的 JSON content 中
 * 格式：[{type: "thinking", content: "..."}, {type: "chat", content: "..."}]
 */
import "dotenv/config";
import { sequelize } from "../config/database.js";

const migrate = async (): Promise<void> => {
  const queryInterface = sequelize.getQueryInterface();

  try {
    console.log("🔧 开始移除 messages 表的 type 字段...\n");

    // 检查 type 字段是否存在
    const columns = await queryInterface.describeTable("messages");

    if (columns.type) {
      // 移除 type 字段
      await queryInterface.removeColumn("messages", "type");
      console.log("✅ 已移除 type 字段");
    } else {
      console.log("⏭️  type 字段不存在，跳过");
    }

    // 同时将 role 枚举改回只有 user/assistant/system（移除 tool）
    try {
      await sequelize.query(`
        ALTER TABLE messages 
        MODIFY COLUMN role ENUM('user', 'assistant', 'system') NOT NULL 
        COMMENT '消息角色：user-用户, assistant-AI助手, system-系统'
      `);
      console.log("✅ 已更新 role 枚举（移除 tool）");
    } catch {
      console.log("⏭️  role 枚举更新失败或已是目标状态，跳过");
    }

    console.log("\n🎉 迁移完成！");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ 迁移失败:", err);
    process.exit(1);
  }
};

migrate();
