/**
 * 文件下载路由
 * 提供 MCP 工具输出文件的下载功能
 */
import Router from "@koa/router";
import path from "path";
import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";

const router = new Router();

// 允许下载的目录（相对于 public 目录）
const ALLOWED_DIRS = ["mcp-outputs"];

/**
 * 下载 MCP 输出文件
 * GET /api/files/mcp-outputs/:filename
 *
 * 注意：此接口不需要认证，安全性依赖于：
 * 1. 文件名包含随机字符串，不可猜测
 * 2. 严格的路径验证，防止目录遍历攻击
 */
router.get("/mcp-outputs/:filename", async (ctx) => {
  const { filename } = ctx.params;

  // 安全性验证：文件名不能包含路径遍历字符
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "无效的文件名" };
    return;
  }

  // 构建文件路径
  const publicDir = path.resolve(process.cwd(), "public");
  const filePath = path.join(publicDir, "mcp-outputs", filename);

  // 验证文件路径是否在允许的目录内
  const normalizedPath = path.normalize(filePath);
  const allowedBasePath = path.join(publicDir, "mcp-outputs");
  if (!normalizedPath.startsWith(allowedBasePath)) {
    ctx.status = 403;
    ctx.body = { code: 403, message: "禁止访问该路径" };
    return;
  }

  // 检查文件是否存在
  if (!existsSync(filePath)) {
    ctx.status = 404;
    ctx.body = { code: 404, message: "文件不存在" };
    return;
  }

  try {
    // 获取文件信息
    const stats = await fs.stat(filePath);

    // 设置响应头
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".txt": "text/plain; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".md": "text/markdown; charset=utf-8",
      ".csv": "text/csv; charset=utf-8",
      ".xml": "application/xml; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".ts": "application/typescript; charset=utf-8",
      ".py": "text/x-python; charset=utf-8",
      ".java": "text/x-java; charset=utf-8",
      ".c": "text/x-c; charset=utf-8",
      ".cpp": "text/x-c++; charset=utf-8",
      ".h": "text/x-c; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".sql": "application/sql; charset=utf-8",
      ".yaml": "application/x-yaml; charset=utf-8",
      ".yml": "application/x-yaml; charset=utf-8",
      ".log": "text/plain; charset=utf-8",
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".zip": "application/zip",
      ".tar": "application/x-tar",
      ".gz": "application/gzip",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";

    // 设置下载响应头
    ctx.set("Content-Type", contentType);
    ctx.set("Content-Length", stats.size.toString());
    ctx.set("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    ctx.set("Cache-Control", "no-cache");

    // 返回文件流
    ctx.body = createReadStream(filePath);
  } catch (error) {
    console.error("[files.ts] 文件下载失败:", error);
    ctx.status = 500;
    ctx.body = { code: 500, message: "文件下载失败" };
  }
});

export default router;
