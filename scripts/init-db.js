/**
 * 数据库初始化脚本
 * 运行: npm run init-db
 */
import "dotenv/config";
import { sequelize, Agent } from "../dao/models/index.js";

const initDatabase = async () => {
  try {
    // 同步所有模型到数据库
    await sequelize.sync({ force: false, alter: true });
    console.log("✅ 数据库表同步完成");

    // 初始化默认 Agent 配置
    const defaultAgents = [
      {
        name: "code-audit",
        displayName: "代码安全审计",
        description:
          "对代码进行安全漏洞检测，识别 SQL 注入、XSS、敏感信息泄露等风险",
        systemPrompt: "你是一个专业的代码安全审计专家...",
        model: "qwen",
      },
      {
        name: "scoring",
        displayName: "样本评分",
        description: "基于预设样本和评分标准，对输入内容进行自动打分",
        systemPrompt: "你是一个内容评分专家...",
        model: "qwen",
      },
      {
        name: "rag-search",
        displayName: "知识检索",
        description: "基于上传的文档进行语义检索，返回相关内容",
        systemPrompt: "你是一个知识检索助手...",
        model: "deepseek",
      },
    ];

    for (const agent of defaultAgents) {
      await Agent.findOrCreate({
        where: { name: agent.name },
        defaults: agent,
      });
    }
    console.log("✅ 默认 Agent 配置初始化完成");

    console.log("🎉 数据库初始化完成");
    process.exit(0);
  } catch (error) {
    console.error("❌ 数据库初始化失败:", error);
    process.exit(1);
  }
};

initDatabase();
