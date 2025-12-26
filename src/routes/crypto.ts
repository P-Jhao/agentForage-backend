/**
 * 加密相关路由
 * 提供公钥获取接口
 */
import Router from "@koa/router";
import CryptoService from "../service/cryptoService.js";

const router = new Router();

/**
 * 获取 RSA 公钥
 * GET /api/crypto/public-key
 */
router.get("/public-key", async (ctx) => {
  try {
    const publicKey = CryptoService.getPublicKey();
    ctx.body = {
      code: 200,
      message: "ok",
      data: { publicKey },
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      code: 500,
      message: (error as Error).message,
    };
  }
});

/**
 * 检查加密服务状态
 * GET /api/crypto/status
 */
router.get("/status", async (ctx) => {
  const status = CryptoService.isAvailable();
  ctx.body = {
    code: 200,
    message: "ok",
    data: status,
  };
});

export default router;
