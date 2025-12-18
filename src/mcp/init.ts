/**
 * MCP 连接初始化模块
 * 在后端服务启动时自动连接所有 connected 状态的 MCP
 */
import McpDAO from "../dao/mcpDAO.js";
import { mcpManager } from "./MCPManager.js";

/**
 * 初始化 MCP 连接
 * 查询所有 connected 状态的 MCP，逐个连接
 */
export async function initMCPConnections(): Promise<void> {
  console.log("\n🔌 开始连接 MCP...");

  try {
    // 查询所有 connected 状态的 MCP
    const mcps = await McpDAO.findByStatus("connected");

    if (mcps.length === 0) {
      console.log("   没有需要连接的 MCP");
      console.log("🔌 MCP 连接完成\n");
      return;
    }

    let successCount = 0;
    let failCount = 0;

    // 串行连接每个 MCP
    for (let i = 0; i < mcps.length; i++) {
      const mcp = mcps[i];
      const index = `[${i + 1}/${mcps.length}]`;
      const startTime = Date.now();

      // 打印 MCP 信息：名称、传输方式、连接信息
      console.log(`   ${index} ${mcp.name}`);
      console.log(`       传输方式: ${mcp.transportType}`);
      if (mcp.transportType === "stdio") {
        console.log(`       命令: ${mcp.command}`);
        if (mcp.args) {
          console.log(`       参数: ${mcp.args}`);
        }
        if (mcp.env) {
          console.log(`       环境变量: ${mcp.env}`);
        }
      } else {
        console.log(`       URL: ${mcp.url}`);
        if (mcp.headers) {
          console.log(`       请求头: ${mcp.headers}`);
        }
      }
      process.stdout.write(`       状态: `);

      try {
        await mcpManager.connect(mcp.id);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ 连接成功 (${duration}s)`);
        successCount++;
      } catch (error) {
        const errorMessage = (error as Error).message;
        console.log(`❌ 连接失败: ${errorMessage}`);
        failCount++;

        // 更新数据库状态为 disconnected
        try {
          await McpDAO.updateStatus(mcp.id, "disconnected");
        } catch {
          // 忽略更新失败
        }
      }
    }

    // 打印连接结果
    console.log(`🔌 MCP 连接完成: ${successCount} 成功, ${failCount} 失败\n`);
  } catch (error) {
    console.error("❌ MCP 连接初始化失败:", (error as Error).message);
  }
}
