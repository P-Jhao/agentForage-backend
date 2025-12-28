/**
 * 用户相关路由
 */
import Router from "@koa/router";
import multer from "@koa/multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { tokenAuth } from "../middleware/index.js";
import UserService from "../service/userService.js";
import UserDAO from "../dao/userDAO.js";
import CryptoService from "../service/cryptoService.js";
import type { CustomModelConfig } from "../dao/userDAO.js";

const router = new Router();

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 头像上传配置
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(__dirname, "../../public/uploads/avatars");
    // 确保目录存在
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // 生成唯一文件名：时间戳 + 随机数 + 扩展名
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, filename);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 限制 2MB
  },
  fileFilter: (_req, file, cb) => {
    // 只允许图片格式
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("只支持 JPG、PNG、GIF、WebP 格式的图片"), false);
    }
  },
});

// 认证请求体类型（密码是 RSA 加密的）
interface AuthRequest {
  username: string;
  nickname?: string; // 注册时可选
  encryptedPassword: string; // RSA 加密后的密码
}

// 用户注册
router.post("/register", async (ctx) => {
  const { username, nickname, encryptedPassword } = ctx.request.body as AuthRequest;

  if (!username || !encryptedPassword) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "账号和密码不能为空" };
    return;
  }

  // RSA 解密密码
  let password: string;
  try {
    password = CryptoService.rsaDecrypt(encryptedPassword);
  } catch (error) {
    console.error("[user.ts] RSA 解密密码失败:", error);
    ctx.status = 400;
    ctx.body = { code: 400, message: "密码解密失败，请刷新页面重试" };
    return;
  }

  const result = await UserService.register({ username, nickname: nickname || "", password });
  ctx.body = { code: 200, message: "注册成功", data: result };
});

// 用户登录
router.post("/login", async (ctx) => {
  const { username, encryptedPassword } = ctx.request.body as AuthRequest;

  if (!username || !encryptedPassword) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "账号和密码不能为空" };
    return;
  }

  // RSA 解密密码
  let password: string;
  try {
    password = CryptoService.rsaDecrypt(encryptedPassword);
  } catch (error) {
    console.error("[user.ts] RSA 解密密码失败:", error);
    ctx.status = 400;
    ctx.body = { code: 400, message: "密码解密失败，请刷新页面重试" };
    return;
  }

  const result = await UserService.login({ username, password });
  ctx.body = { code: 200, message: "登录成功", data: result };
});

// 获取当前用户信息
router.get("/info", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const result = await UserService.getUserInfo(userId);
  ctx.body = { code: 200, message: "ok", data: result };
});

/**
 * 获取用户的模型配置
 * GET /api/user/model-config
 * 注意：返回的 apiKey 是明文（已解密），前端显示时需要脱敏
 */
router.get("/model-config", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const config = await UserDAO.getModelConfig(userId);

  // 默认配置
  const defaultConfig: CustomModelConfig = {
    mode: "builtin",
  };

  // 返回配置，apiKey 脱敏处理（只显示前4位和后4位）
  if (config?.apiKey) {
    const key = config.apiKey;
    if (key.length > 8) {
      config.apiKey = key.slice(0, 4) + "****" + key.slice(-4);
    } else {
      config.apiKey = "****";
    }
  }

  ctx.body = { code: 200, message: "ok", data: config ?? defaultConfig };
});

// 请求体类型（前端传来的数据，apiKey 是 RSA 加密的）
interface ModelConfigRequest {
  mode: "builtin" | "custom";
  baseUrl?: string;
  encryptedApiKey?: string; // RSA 加密后的 apiKey（可选，未修改时不传）
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * 更新用户的模型配置
 * PUT /api/user/model-config
 * 前端传来的 apiKey 是 RSA 加密的，需要先解密
 */
router.put("/model-config", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const request = ctx.request.body as ModelConfigRequest;

  // 验证必填字段
  if (!request.mode || !["builtin", "custom"].includes(request.mode)) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "mode 必须是 builtin 或 custom" };
    return;
  }

  // 构建配置对象
  const config: CustomModelConfig = {
    mode: request.mode,
    baseUrl: request.baseUrl,
    model: request.model,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
  };

  // 自定义模式下处理 apiKey
  if (request.mode === "custom") {
    if (!request.baseUrl || !request.model) {
      ctx.status = 400;
      ctx.body = { code: 400, message: "自定义模式下 baseUrl、model 为必填" };
      return;
    }

    if (request.encryptedApiKey) {
      // 有新的 apiKey，RSA 解密
      try {
        config.apiKey = CryptoService.rsaDecrypt(request.encryptedApiKey);
      } catch (error) {
        console.error("[user.ts] RSA 解密 apiKey 失败:", error);
        ctx.status = 400;
        ctx.body = { code: 400, message: "apiKey 解密失败，请刷新页面重试" };
        return;
      }
    } else {
      // 没有新的 apiKey，保留原有的
      const existingConfig = await UserDAO.getModelConfig(userId);
      if (!existingConfig?.apiKey) {
        ctx.status = 400;
        ctx.body = { code: 400, message: "自定义模式下 apiKey 为必填" };
        return;
      }
      // 注意：getModelConfig 返回的是解密后的 apiKey
      config.apiKey = existingConfig.apiKey;
    }
  }

  try {
    const success = await UserDAO.updateModelConfig(userId, config);
    if (success) {
      ctx.body = { code: 200, message: "保存成功" };
    } else {
      ctx.status = 500;
      ctx.body = { code: 500, message: "保存失败" };
    }
  } catch (error) {
    console.error("[user.ts] 保存模型配置失败:", error);
    ctx.status = 500;
    ctx.body = { code: 500, message: (error as Error).message };
  }
});

/**
 * 上传头像
 * POST /api/user/avatar
 */
router.post("/avatar", tokenAuth(), avatarUpload.single("avatar"), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const file = ctx.file;

  if (!file) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "请选择要上传的头像" };
    return;
  }

  // 生成头像 URL（使用 /api 前缀，便于前端代理）
  const avatarUrl = `/api/uploads/avatars/${file.filename}`;

  try {
    // 获取旧头像路径，用于删除
    const user = await UserDAO.findById(userId);
    const oldAvatar = user?.avatar;

    // 更新用户头像
    await UserService.updateProfile({ userId, avatar: avatarUrl });

    // 删除旧头像文件（如果存在且不是默认头像）
    if (
      oldAvatar &&
      (oldAvatar.startsWith("/api/uploads/avatars/") || oldAvatar.startsWith("/uploads/avatars/"))
    ) {
      // 移除 /api 前缀获取实际文件路径
      const relativePath = oldAvatar.replace(/^\/api/, "");
      const oldPath = path.join(__dirname, "../../public", relativePath);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    ctx.body = { code: 200, message: "头像上传成功", data: { avatar: avatarUrl } };
  } catch (error) {
    // 上传失败时删除已上传的文件
    const filePath = path.join(__dirname, "../../public/uploads/avatars", file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error("[user.ts] 头像上传失败:", error);
    ctx.status = 500;
    ctx.body = { code: 500, message: "头像上传失败" };
  }
});

// 修改密码请求体类型
interface ChangePasswordRequest {
  encryptedOldPassword: string; // RSA 加密后的旧密码
  encryptedNewPassword: string; // RSA 加密后的新密码
}

/**
 * 修改密码
 * PUT /api/user/password
 */
router.put("/password", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { encryptedOldPassword, encryptedNewPassword } = ctx.request.body as ChangePasswordRequest;

  if (!encryptedOldPassword || !encryptedNewPassword) {
    ctx.status = 400;
    ctx.body = { code: 400, message: "请输入原密码和新密码" };
    return;
  }

  // RSA 解密密码
  let oldPassword: string;
  let newPassword: string;
  try {
    oldPassword = CryptoService.rsaDecrypt(encryptedOldPassword);
    newPassword = CryptoService.rsaDecrypt(encryptedNewPassword);
  } catch (error) {
    console.error("[user.ts] RSA 解密密码失败:", error);
    ctx.status = 400;
    ctx.body = { code: 400, message: "密码解密失败，请刷新页面重试" };
    return;
  }

  try {
    await UserService.changePassword({ userId, oldPassword, newPassword });
    ctx.body = { code: 200, message: "密码修改成功" };
  } catch (error) {
    const err = error as Error & { status?: number };
    ctx.status = err.status || 500;
    ctx.body = { code: err.status || 500, message: err.message };
  }
});

// 更新资料请求体类型
interface UpdateProfileRequest {
  nickname?: string;
  email?: string;
}

/**
 * 更新用户资料
 * PUT /api/user/profile
 */
router.put("/profile", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id as number;
  const { nickname, email } = ctx.request.body as UpdateProfileRequest;

  try {
    await UserService.updateProfile({ userId, nickname, email });
    ctx.body = { code: 200, message: "资料更新成功" };
  } catch (error) {
    const err = error as Error & { status?: number };
    ctx.status = err.status || 500;
    ctx.body = { code: err.status || 500, message: err.message };
  }
});

export default router;
