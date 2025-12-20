/**
 * 消息表迁移脚本
 * 将旧的 JSON 数组存储格式迁移到新的扁平格式（每段一条记录）
 *
 * 运行方式：pnpm tsx src/scripts/migrate-message-table.ts
 */
import "dotenv/config";
import { sequelize } from "../config/database.js";
import { QueryTypes } from "sequelize";

interface OldMessage {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

interface MessageSegment {
  type: string;
  content?: string;
  callId?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  success?: boolean;
}

async function migrate() {
  console.log("🚀 开始迁移消息表...");

  try {
    // 1. 添加新字段（如果不存在）
    console.log("📝 添加新字段...");

    const alterStatements = [
      "ALTER TABLE messages ADD COLUMN IF NOT EXISTS type ENUM('chat', 'thinking', 'tool_call', 'error') NOT NULL DEFAULT 'chat' AFTER role",
      "ALTER TABLE messages ADD COLUMN IF NOT EXISTS call_id VARCHAR(64) NULL AFTER content",
      "ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_name VARCHAR(128) NULL AFTER call_id",
      "ALTER TABLE messages ADD COLUMN IF NOT EXISTS `arguments` TEXT NULL AFTER tool_name",
      "ALTER TABLE messages ADD COLUMN IF NOT EXISTS result TEXT NULL AFTER `arguments`",
      "ALTER TABLE messages ADD COLUMN IF NOT EXISTS success BOOLEAN NULL AFTER result",
    ];

    for (const sql of alterStatements) {
      try {
        await sequelize.query(sql);
      } catch (err) {
        // 忽略字段已存在的错误
        const error = err as Error;
        if (!error.message.includes("Duplicate column")) {
          console.warn(`  ⚠️ ${error.message}`);
        }
      }
    }
    console.log("  ✅ 字段添加完成");

    // 2. 查询所有 assistant 消息（旧格式：content 是 JSON 数组）
    console.log("📖 读取旧格式的 assistant 消息...");
    const oldMessages = await sequelize.query<OldMessage>(
      "SELECT * FROM messages WHERE role = 'assistant' AND content LIKE '[%' ORDER BY id ASC",
      { type: QueryTypes.SELECT }
    );
    console.log(`  找到 ${oldMessages.length} 条需要迁移的消息`);

    if (oldMessages.length === 0) {
      console.log("✅ 没有需要迁移的数据");
      return;
    }

    // 3. 迁移每条消息
    console.log("🔄 开始迁移数据...");
    let migratedCount = 0;
    let errorCount = 0;

    for (const oldMsg of oldMessages) {
      try {
        // 解析 JSON 内容
        const segments: MessageSegment[] = JSON.parse(oldMsg.content);

        if (!Array.isArray(segments) || segments.length === 0) {
          continue;
        }

        // 删除原消息
        await sequelize.query("DELETE FROM messages WHERE id = ?", {
          replacements: [oldMsg.id],
        });

        // 为每个段落创建新消息（保持时间顺序，每条消息时间递增 1ms）
        let timeOffset = 0;
        for (const segment of segments) {
          const createdAt = new Date(oldMsg.created_at.getTime() + timeOffset);
          timeOffset += 1; // 每条消息递增 1ms 保持顺序

          if (segment.type === "tool_call") {
            await sequelize.query(
              `INSERT INTO messages (conversation_id, role, type, content, call_id, tool_name, \`arguments\`, result, success, created_at, updated_at)
               VALUES (?, 'assistant', 'tool_call', '', ?, ?, ?, ?, ?, ?, ?)`,
              {
                replacements: [
                  oldMsg.conversation_id,
                  segment.callId || null,
                  segment.toolName || null,
                  segment.arguments ? JSON.stringify(segment.arguments) : null,
                  segment.result !== undefined ? JSON.stringify(segment.result) : null,
                  segment.success ?? false,
                  createdAt,
                  oldMsg.updated_at,
                ],
              }
            );
          } else {
            // chat/thinking/error 类型
            const msgType = segment.type === "tool" ? "chat" : segment.type || "chat";
            await sequelize.query(
              `INSERT INTO messages (conversation_id, role, type, content, created_at, updated_at)
               VALUES (?, 'assistant', ?, ?, ?, ?)`,
              {
                replacements: [
                  oldMsg.conversation_id,
                  msgType,
                  segment.content || "",
                  createdAt,
                  oldMsg.updated_at,
                ],
              }
            );
          }
        }

        migratedCount++;
      } catch (err) {
        errorCount++;
        console.error(`  ❌ 迁移消息 ${oldMsg.id} 失败:`, (err as Error).message);
      }
    }

    console.log(`✅ 迁移完成: 成功 ${migratedCount} 条, 失败 ${errorCount} 条`);
  } catch (error) {
    console.error("❌ 迁移失败:", (error as Error).message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// 执行迁移
migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
