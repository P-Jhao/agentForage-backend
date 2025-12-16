/**
 * 任务系统数据库迁移脚本
 * 运行: npx tsx src/scripts/migrate-task-system.ts
 *
 * 迁移内容：
 * 1. conversations 表：新增 uuid, favorite, status 字段
 * 2. messages 表：扩展 role 枚举，新增 type 字段
 */
import "dotenv/config";
import { sequelize } from "../config/database.js";
import { QueryInterface, DataTypes } from "sequelize";

const migrate = async (): Promise<void> => {
  const queryInterface: QueryInterface = sequelize.getQueryInterface();

  try {
    console.log("🚀 开始执行任务系统数据库迁移...\n");

    // ========== conversations 表迁移 ==========
    console.log("📦 迁移 conversations 表...");

    // 检查 uuid 字段是否存在
    const conversationColumns = await queryInterface.describeTable("conversations");

    if (!conversationColumns.uuid) {
      // 新增 uuid 字段
      await queryInterface.addColumn("conversations", "uuid", {
        type: DataTypes.STRING(36),
        allowNull: true, // 先允许为空，后续填充数据后再改为不允许
        unique: true,
        comment: "前端生成的 UUID",
      });
      console.log("  ✅ 新增 uuid 字段");

      // 为现有记录生成 UUID
      await sequelize.query(`
        UPDATE conversations 
        SET uuid = UUID() 
        WHERE uuid IS NULL
      `);
      console.log("  ✅ 为现有记录生成 UUID");

      // 修改 uuid 为不允许为空
      await queryInterface.changeColumn("conversations", "uuid", {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true,
        comment: "前端生成的 UUID",
      });
      console.log("  ✅ 设置 uuid 为必填字段");
    } else {
      console.log("  ⏭️  uuid 字段已存在，跳过");
    }

    if (!conversationColumns.favorite) {
      // 新增 favorite 字段
      await queryInterface.addColumn("conversations", "favorite", {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "是否收藏",
      });
      console.log("  ✅ 新增 favorite 字段");
    } else {
      console.log("  ⏭️  favorite 字段已存在，跳过");
    }

    if (!conversationColumns.status) {
      // 新增 status 字段
      await queryInterface.addColumn("conversations", "status", {
        type: DataTypes.ENUM("running", "completed", "cancelled"),
        defaultValue: "completed", // 现有记录默认为已完成
        comment: "任务状态：running-运行中, completed-已完成, cancelled-已取消",
      });
      console.log("  ✅ 新增 status 字段");
    } else {
      console.log("  ⏭️  status 字段已存在，跳过");
    }

    // 检查 agentId 字段是否存在
    if (conversationColumns.agentId) {
      // 修改 agentId 允许为空
      await queryInterface.changeColumn("conversations", "agentId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: "Agent ID，0 表示无特定 Agent",
      });
      console.log("  ✅ 修改 agentId 为可选字段");
    } else {
      // 如果不存在，新增 agentId 字段
      await queryInterface.addColumn("conversations", "agentId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: "Agent ID，0 表示无特定 Agent",
      });
      console.log("  ✅ 新增 agentId 字段");
    }

    // ========== messages 表迁移 ==========
    console.log("\n📦 迁移 messages 表...");

    const messageColumns = await queryInterface.describeTable("messages");

    // 扩展 role 枚举（MySQL 需要先修改列类型）
    // 注意：Sequelize 的 changeColumn 对 ENUM 支持有限，使用原生 SQL
    try {
      await sequelize.query(`
        ALTER TABLE messages 
        MODIFY COLUMN role ENUM('user', 'assistant', 'system', 'tool') NOT NULL 
        COMMENT '消息角色：user-用户, assistant-AI助手, system-系统, tool-工具'
      `);
      console.log("  ✅ 扩展 role 枚举，添加 tool 类型");
    } catch {
      // 如果已经是新的枚举类型，忽略错误
      console.log("  ⏭️  role 枚举已是最新，跳过");
    }

    if (!messageColumns.type) {
      // 新增 type 字段
      await queryInterface.addColumn("messages", "type", {
        type: DataTypes.STRING(20),
        defaultValue: "chat",
        comment: "消息类型：thinking-思考链, chat-对话, tool-工具调用, error-错误",
      });
      console.log("  ✅ 新增 type 字段");
    } else {
      console.log("  ⏭️  type 字段已存在，跳过");
    }

    console.log("\n🎉 任务系统数据库迁移完成！");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ 迁移失败:", err);
    process.exit(1);
  }
};

migrate();
