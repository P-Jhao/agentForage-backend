/**
 * 文件上传路由
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import multer, { type File } from "@koa/multer";
import type { IncomingMessage } from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 头像上传目录
const avatarUploadDir = path.join(__dirname, "../../public/uploads/avatars");
// 聊天文件上传目录
const chatUploadDir = path.join(__dirname, "../../public/uploads/chat");

// 确保上传目录存在
if (!fs.existsSync(avatarUploadDir)) {
  fs.mkdirSync(avatarUploadDir, { recursive: true });
}
if (!fs.existsSync(chatUploadDir)) {
  fs.mkdirSync(chatUploadDir, { recursive: true });
}

// 头像上传配置
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, avatarUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${randomUUID()}${ext}`;
    cb(null, filename);
  },
});

// 头像文件过滤器：只允许图片
const avatarFileFilter = (
  _req: IncomingMessage,
  file: File,
  cb: (error: Error | null, acceptFile: boolean) => void
) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("只支持 JPG、PNG、GIF、WebP 格式的图片"), false);
  }
};

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 最大 5MB
  },
});

// 聊天文件上传配置
const chatStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, chatUploadDir);
  },
  filename: (_req, file, cb) => {
    // 保留原始文件名，但添加 UUID 前缀避免冲突
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    // 清理文件名中的特殊字符
    const safeName = baseName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
    const filename = `${randomUUID()}_${safeName}${ext}`;
    cb(null, filename);
  },
});

// 聊天文件支持的扩展名（与 MCP 服务器支持的格式对应）
const SUPPORTED_EXTENSIONS = [
  // 文档格式（file-to-markdown-mcp）
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  // 纯文本格式（read-text-file-mcp）
  ".txt",
  ".log",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".cs",
  ".vue",
  ".svelte",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".csv",
  ".tsv",
  ".env",
  ".ini",
  ".toml",
  ".conf",
  ".config",
  ".md",
  ".markdown",
  ".rst",
  ".html",
  ".css",
  ".scss",
  ".less",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".bat",
  ".cmd",
];

// 文件大小限制（字节）
const FILE_SIZE_LIMITS: Record<string, number> = {
  // 文档格式
  ".pdf": 10 * 1024 * 1024, // 10MB
  ".docx": 10 * 1024 * 1024, // 10MB
  ".xlsx": 5 * 1024 * 1024, // 5MB
  ".pptx": 15 * 1024 * 1024, // 15MB
  // 纯文本格式默认 1MB
};
const DEFAULT_SIZE_LIMIT = 1 * 1024 * 1024; // 1MB

// 聊天文件过滤器
const chatFileFilter = (
  _req: IncomingMessage,
  file: File,
  cb: (error: Error | null, acceptFile: boolean) => void
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    cb(new Error(`不支持的文件类型: ${ext}`), false);
    return;
  }

  // 检查文件大小限制
  const sizeLimit = FILE_SIZE_LIMITS[ext] || DEFAULT_SIZE_LIMIT;
  if (file.size > sizeLimit) {
    const limitMB = (sizeLimit / (1024 * 1024)).toFixed(0);
    cb(new Error(`${ext} 文件大小不能超过 ${limitMB}MB`), false);
    return;
  }

  cb(null, true);
};

const chatUpload = multer({
  storage: chatStorage,
  fileFilter: chatFileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 单文件最大 15MB（PPTX 最大）
  },
});

const router = new Router();

/**
 * 上传头像
 * POST /api/upload/avatar
 */
router.post("/avatar", tokenAuth(), avatarUpload.single("file"), async (ctx) => {
  const file = ctx.file;

  if (!file) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "请选择要上传的图片", data: null };
    return;
  }

  // 返回图片访问 URL（使用 /api 前缀，与 API 共用代理）
  const url = `/api/uploads/avatars/${file.filename}`;

  ctx.body = {
    code: 200,
    message: "上传成功",
    data: { url },
  };
});

/**
 * 上传聊天文件
 * POST /api/upload/chat
 * 返回文件的绝对路径（用于 MCP 工具读取）
 */
router.post("/chat", tokenAuth(), chatUpload.single("file"), async (ctx) => {
  const file = ctx.file;

  if (!file) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "请选择要上传的文件", data: null };
    return;
  }

  // 解码原始文件名（处理中文等非 ASCII 字符）
  let originalName = file.originalname;
  try {
    // 尝试 URL 解码（某些浏览器会对文件名进行 URL 编码）
    originalName = decodeURIComponent(file.originalname);
  } catch {
    // 如果解码失败，尝试 Latin1 到 UTF-8 转换
    try {
      originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    } catch {
      // 保持原样
    }
  }

  // 返回文件信息
  ctx.body = {
    code: 200,
    message: "上传成功",
    data: {
      // 文件绝对路径（用于 MCP 工具读取）
      filePath: file.path,
      // 原始文件名（已解码）
      originalName,
      // 存储的文件名
      filename: file.filename,
      // 文件大小（字节）
      size: file.size,
      // 文件类型
      mimetype: file.mimetype,
      // 文件访问 URL（可选，用于前端预览）
      url: `/api/uploads/chat/${file.filename}`,
    },
  };
});

export default router;
