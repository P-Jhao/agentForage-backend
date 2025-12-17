import "dotenv/config";
import Koa from "koa";
import cors from "@koa/cors";
import { bodyParser } from "@koa/bodyparser";
import { errorHandler } from "./middleware/errorHandler.js";
import routes from "./routes/index.js";
import { sequelize, initSuperAdmin } from "./config/database.js";
import "./dao/models/index.js"; // 确保模型被加载

const app = new Koa();

// 中间件注册
app.use(cors());
app.use(bodyParser());
app.use(errorHandler());

// 路由挂载
app.use(routes.routes());
app.use(routes.allowedMethods());

// 启动服务
const PORT = process.env.PORT || 3000;

// 数据库同步并启动服务
const startServer = async () => {
  try {
    // 同步数据库（开发环境使用 alter，生产环境应使用迁移）
    await sequelize.sync({ alter: process.env.NODE_ENV === "development" });
    console.log("✅ 数据库同步完成");

    // 初始化超级管理员账号
    await initSuperAdmin();

    // 启动 HTTP 服务
    app.listen(PORT, () => {
      console.log(`🚀 AgentForge 服务已启动: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ 服务启动失败:", (error as Error).message);
    process.exit(1);
  }
};

startServer();

export default app;
