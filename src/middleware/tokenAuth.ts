/**
 * JWT Token 认证中间件
 */
import type { Context, Next } from "koa";
import jwt from "jsonwebtoken";

export interface JwtPayload {
  id: number;
  username: string;
  role: "user" | "root" | "operator"; // 用户角色
}

export const tokenAuth = () => {
  return async (ctx: Context, next: Next): Promise<void> => {
    const authHeader = ctx.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      ctx.status = 401;
      ctx.body = { code: 401, message: "未提供认证令牌", data: null };
      return;
    }

    const token = authHeader.slice(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      ctx.state.user = decoded;
      await next();
    } catch (error) {
      console.error("[tokenAuth] JWT 验证失败:", (error as Error).message);
      ctx.status = 401;
      ctx.body = { code: 401, message: "令牌无效或已过期", data: null };
    }
  };
};
