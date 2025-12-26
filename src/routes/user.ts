/**
 * 用户相关路由
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import UserService from "../service/userService.js";
import UserDAO from "../dao/userDAO.js";
import CryptoService from "../service/cryptoService.js";
import type { CustomModelConfig } from "../dao/userDAO.js";

const router = new Router();

// 用户注册
router.post("/register", async (ctx) => {
  const { username, password } = ctx.request.body as { username: string; password: string };
  const result = await UserService.register({ username, password });
  ctx.body = { code: 200, message: "注册成功", data: result };
});

// 用户登录
router.post("/login", async (ctx) => {
  const { username, password } = ctx.request.body as { username: string; password: string };
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

export default router;
