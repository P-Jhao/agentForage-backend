/**
 * 全局错误处理中间件
 */
import type { Context, Next } from "koa";

interface AppError extends Error {
  status?: number;
}

export const errorHandler = () => {
  return async (ctx: Context, next: Next): Promise<void> => {
    try {
      await next();
    } catch (err) {
      const error = err as AppError;
      const status = error.status || 500;
      const message = error.message || "服务器内部错误";

      ctx.status = status;
      ctx.body = {
        code: status,
        message,
        data: null,
      };

      // 开发环境打印错误堆栈
      if (process.env.NODE_ENV === "development") {
        console.error("❌ 错误:", error);
      }
    }
  };
};
