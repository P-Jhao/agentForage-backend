/**
 * 管理员权限验证中间件
 * 需要在 tokenAuth 之后使用
 */
import type { Context, Next } from "koa";

/**
 * 管理员权限验证
 * 检查用户角色是否为 root
 */
export const adminAuth = () => {
  return async (ctx: Context, next: Next) => {
    const user = ctx.state.user;

    if (!user) {
      ctx.status = 401;
      ctx.body = { code: 401, message: "未登录" };
      return;
    }

    if (user.role !== "root") {
      ctx.status = 403;
      ctx.body = { code: 403, message: "需要管理员权限" };
      return;
    }

    await next();
  };
};
