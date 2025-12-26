/**
 * 用户相关路由
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import UserService from "../service/userService.js";
import UserDAO from "../dao/userDAO.js";
import type { CustomModelConfig } from "../dao/userDAO.js";

const router = new Router();

// 用户注册
router.post("/register", async (ctx) => {
  const { username, password } = ctx.request.body as { username: string; password: string };
  const result = await UserService.register({ username, password });
  ctx.body = { code: 200, message: "注册成功", data: result };
});

// 用户登录
router.post("/login", async (ctx) => {
  const { username, password } = ctx.request.body as { username: string; password: string };
  const result = await UserService.login({ username, password });
  ctx.body = { code: 200, message: "登录成功", data: result };
});

// 获取当前用户信息
router.get("/info", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const result = await UserService.getUserInfo(userId);
  ctx.body = { code: 200, message: "ok", data: result };
});

/**
 * 获取用户的模型配置
 * GET /api/user/model-config
 */
router.get("/model-config", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const config = await UserDAO.getModelConfig(userId);
  // 默认配置
  const defaultConfig: CustomModelConfig = {
    mode: "builtin",
  };
  ctx.body = { code: 200, message: "ok", data: config ?? defaultConfig };
});

/**
 * 更新用户的模型配置
 * PUT /api/user/model-config
 */
router.put("/model-config", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const config = ctx.request.body as CustomModelConfig;

  // 验证必填字段
  if (!config.mode || !["builtin", "custom"].includes(config.mode)) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "mode 必须是 builtin 或 custom" };
    return;
  }

  // 自定义模式下验证必填字段
  if (config.mode === "custom") {
    if (!config.baseUrl || !config.apiKey || !config.model) {
      ctx.status = 400;
      ctx.body = { code: 400, message: "自定义模式下 baseUrl、apiKey、model 为必填" };
      return;
    }
  }

  const success = await UserDAO.updateModelConfig(userId, config);
  if (success) {
    ctx.body = { code: 200, message: "保存成功" };
  } else {
    ctx.status = 500;
    ctx.body = { code: 500, message: "保存失败" };
  }
});

export default router;
