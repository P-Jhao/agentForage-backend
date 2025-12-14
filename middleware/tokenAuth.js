/**
 * JWT Token 认证中间件
 */
import jwt from "jsonwebtoken";

export const tokenAuth = () => {
  return async (ctx, next) => {
    const authHeader = ctx.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      ctx.status = 401;
      ctx.body = { code: 401, message: "未提供认证令牌", data: null };
      return;
    }

    const token = authHeader.slice(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      ctx.state.user = decoded;
      await next();
    } catch (err) {
      ctx.status = 401;
      ctx.body = { code: 401, message: "令牌无效或已过期", data: null };
    }
  };
};
