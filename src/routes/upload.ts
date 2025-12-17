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

// 上传目录
const uploadDir = path.join(__dirname, "../../public/uploads/avatars");

// 确保上传目录存在
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // 生成唯一文件名：uuid + 原始扩展名
    const ext = path.extname(file.originalname);
    const filename = `${randomUUID()}${ext}`;
    cb(null, filename);
  },
});

// 文件过滤器：只允许图片
const fileFilter = (
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

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 最大 5MB
  },
});

const router = new Router();

/**
 * 上传头像
 * POST /api/upload/avatar
 */
router.post("/avatar", tokenAuth(), upload.single("file"), async (ctx) => {
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

export default router;
