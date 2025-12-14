/**
 * ESLint 配置 (Flat Config)
 */
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  // 忽略文件
  {
    ignores: ["dist/**", "node_modules/**"],
  },

  // JavaScript 基础规则
  eslint.configs.recommended,

  // TypeScript 规则
  ...tseslint.configs.recommended,

  // 自定义规则
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
];
