/**
 * 修复 agentId 字段允许为 null
 * 运行: npx tsx src/scripts/fix-agentid-nullable.ts
 *
 * 问题：conversations 表的 agent_id 有外键约束，不允许为 null
 * 解决：删除外键约束，修改字段允许 null
 */
import "dotenv/config";
import { sequelize } from "../config/database.js";

const fix = async (): Promise<void> => {
  try {
    console.log("🔧 开始修复 agentId 字段...\n");

    // 1. 查找外键约束名称
    const [constraints] = await sequelize.query(`
      SELECT CONSTRAINT_NAME 
      FROM information_schema.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'conversations' 
        AND COLUMN_NAME = 'agent_id' 
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);

    console.log("📋 找到的外键约束:", constraints);

    // 2. 删除外键约束
    for (const constraint of constraints as Array<{ CONSTRAINT_NAME: string }>) {
      const constraintName = constraint.CONSTRAINT_NAME;
      console.log(`  🗑️  删除外键约束: ${constraintName}`);
      await sequelize.query(`
        ALTER TABLE conversations 
        DROP FOREIGN KEY ${constraintName}
      `);
    }

    // 3. 修改 agent_id 字段允许为 null
    console.log("  📝 修改 agent_id 允许为 null...");
    await sequelize.query(`
      ALTER TABLE conversations 
      MODIFY COLUMN agent_id INT NULL DEFAULT NULL 
      COMMENT 'Agent ID，null 表示无特定 Agent'
    `);

    // 4. 将现有的 agent_id = 0 改为 null（如果有的话）
    console.log("  🔄 将 agent_id = 0 的记录改为 null...");
    await sequelize.query(`
      UPDATE conversations 
      SET agent_id = NULL 
      WHERE agent_id = 0
    `);

    console.log("\n🎉 修复完成！agent_id 现在允许为 null");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ 修复失败:", err);
    process.exit(1);
  }
};

fix();
