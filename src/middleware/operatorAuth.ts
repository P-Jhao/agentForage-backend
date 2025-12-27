/**
 * 运营员权限验证中间件
 * 需要在 tokenAuth 之后使用
 * 仅允许 operator 角色访问（root 不可访问）
 */
import type { Context, Next } from "koa";

/**
 * 运营员权限验证
 * 检查用户角色是否为 operator
 */
export const operatorAuth = () => {
  return async (ctx: Context, next: Next) => {
    const user = ctx.state.user;

    if (!user) {
      ctx.status = 401;
      ctx.body = { code: 401, message: "未登录" };
      return;
    }

    if (user.role !== "operator") {
      ctx.status = 403;
      ctx.body = { code: 403, message: "无权限访问" };
      return;
    }

    await next();
  };
};
