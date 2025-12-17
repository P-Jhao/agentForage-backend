/**
 * 路由统一入口
 */
import Router from "@koa/router";
import userRoutes from "./user.js";
import agentRoutes from "./agent.js";
import chatRoutes from "./chat.js";
import documentRoutes from "./document.js";
import mcpRoutes from "./mcp.js";
import taskRoutes from "./task.js";
import forgeRoutes from "./forge.js";
import uploadRoutes from "./upload.js";

const router = new Router({ prefix: "/api" });

// 健康检查
router.get("/health", (ctx) => {
  ctx.body = { code: 200, message: "ok", data: { status: "healthy" } };
});

// 挂载子路由
router.use("/user", userRoutes.routes());
router.use("/agent", agentRoutes.routes());
router.use("/chat", chatRoutes.routes());
router.use("/document", documentRoutes.routes());
router.use("/mcp", mcpRoutes.routes());
router.use("/task", taskRoutes.routes());
router.use("/forge", forgeRoutes.routes());
router.use("/upload", uploadRoutes.routes());

export default router;
