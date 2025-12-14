import "dotenv/config";
import Koa from "koa";
import cors from "@koa/cors";
import { bodyParser } from "@koa/bodyparser";
import { errorHandler } from "./middleware/errorHandler.js";
import routes from "./routes/index.js";

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
app.listen(PORT, () => {
  console.log(`🚀 AgentForge 服务已启动: http://localhost:${PORT}`);
});

export default app;
