/**
 * Vitest 配置文件
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 测试环境
    environment: "node",
    // 包含的测试文件
    include: ["src/**/*.test.ts"],
    // 全局变量
    globals: true,
  },
});
