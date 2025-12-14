/**
 * 用户相关路由
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import UserService from "../service/userService.js";

const router = new Router();

// 用户注册
router.post("/register", async (ctx) => {
  const { username, password } = ctx.request.body;
  const result = await UserService.register({ username, password });
  ctx.body = { code: 200, message: "注册成功", data: result };
});

// 用户登录
router.post("/login", async (ctx) => {
  const { username, password } = ctx.request.body;
  const result = await UserService.login({ username, password });
  ctx.body = { code: 200, message: "登录成功", data: result };
});

// 获取当前用户信息
router.get("/info", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id;
  const result = await UserService.getUserInfo(userId);
  ctx.body = { code: 200, message: "ok", data: result };
});

export default router;
