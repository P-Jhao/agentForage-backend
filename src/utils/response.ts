/**
 * 统一响应格式工具
 */

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
}

/**
 * 成功响应
 */
export const success = <T>(data: T | null = null, message = "ok"): ApiResponse<T> => {
  return { code: 200, message, data };
};

/**
 * 错误响应
 */
export const error = (message = "操作失败", code = 400): ApiResponse<null> => {
  return { code, message, data: null };
};
