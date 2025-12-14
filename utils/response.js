/**
 * 统一响应格式工具
 */

/**
 * 成功响应
 */
export const success = (data = null, message = "ok") => {
  return { code: 200, message, data };
};

/**
 * 错误响应
 */
export const error = (message = "操作失败", code = 400) => {
  return { code, message, data: null };
};
