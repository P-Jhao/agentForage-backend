/**
 * 全局错误处理中间件
 */
export const errorHandler = () => {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      const status = err.status || 500;
      const message = err.message || "服务器内部错误";

      ctx.status = status;
      ctx.body = {
        code: status,
        message,
        data: null,
      };

      // 开发环境打印错误堆栈
      if (process.env.NODE_ENV === "development") {
        console.error("❌ 错误:", err);
      }
    }
  };
};
