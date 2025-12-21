/**
 * 修复重复索引问题
 * 删除所有表中重复的索引
 *
 * 运行: pnpm tsx src/scripts/fix-duplicate-indexes.ts
 */
import { sequelize } from "../config/database.js";
import { QueryTypes } from "sequelize";

interface IndexInfo {
  Key_name: string;
  Column_name: string;
}

interface TableInfo {
  Tables_in_agentforge: string;
}

async function fixDuplicateIndexes() {
  try {
    // 获取所有表
    const tables = await sequelize.query<TableInfo>("SHOW TABLES", { type: QueryTypes.SELECT });
    const tableNames = tables.map((t) => Object.values(t)[0] as string);

    console.log(`📊 数据库中共有 ${tableNames.length} 个表\n`);

    for (const tableName of tableNames) {
      console.log(`🔍 检查表: ${tableName}`);

      // 获取该表的所有索引
      const indexes = await sequelize.query<IndexInfo>(`SHOW INDEX FROM \`${tableName}\``, {
        type: QueryTypes.SELECT,
      });

      // 按列名分组索引
      const indexesByColumn = new Map<string, string[]>();
      for (const idx of indexes) {
        if (idx.Key_name === "PRIMARY") continue;
        const key = idx.Column_name;
        if (!indexesByColumn.has(key)) {
          indexesByColumn.set(key, []);
        }
        const list = indexesByColumn.get(key)!;
        if (!list.includes(idx.Key_name)) {
          list.push(idx.Key_name);
        }
      }

      // 找出有重复索引的列
      let deletedCount = 0;
      for (const [column, indexNames] of indexesByColumn) {
        if (indexNames.length > 1) {
          // 保留第一个，删除其他
          const toDelete = indexNames.slice(1);
          for (const indexName of toDelete) {
            try {
              await sequelize.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
              console.log(`   ✓ 删除 ${column} 列的重复索引: ${indexName}`);
              deletedCount++;
            } catch (error) {
              console.log(`   ✗ 删除失败: ${(error as Error).message}`);
            }
          }
        }
      }

      if (deletedCount === 0) {
        console.log(`   ✅ 无重复索引`);
      }
    }

    console.log("\n✅ 所有表检查完成");
  } catch (error) {
    console.error("❌ 执行失败:", (error as Error).message);
  } finally {
    await sequelize.close();
  }
}

fixDuplicateIndexes();
