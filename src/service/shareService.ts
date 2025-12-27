/**
 * 分享服务
 * 提供任务分享链接的生成和验证功能
 */
import crypto from "crypto";

// 从环境变量读取分享密钥（如果没有配置，使用 AES_SECRET_KEY）
const SHARE_SECRET_KEY =
  process.env.SHARE_SECRET_KEY || process.env.AES_SECRET_KEY || "default-share-secret-key";

// 最大有效期（7 天）
const MAX_EXPIRE_DAYS = 7;

// 签名分隔符
const SEPARATOR = "|";

interface SharePayload {
  resourceId: string; // 资源 ID（任务 UUID）
  mode: "detail" | "replay"; // 分享模式
  expireAt: number; // 过期时间戳（毫秒）
}

class ShareService {
  /**
   * 生成分享签名
   * @param resourceId 资源 ID（任务 UUID）
   * @param mode 分享模式（detail 或 replay）
   * @param expireDays 有效天数（1-7）
   * @returns Base64 编码的签名字符串
   */
  generateSign(resourceId: string, mode: "detail" | "replay", expireDays: number): string {
    // 验证有效期范围
    const days = Math.min(Math.max(1, expireDays), MAX_EXPIRE_DAYS);

    // 计算过期时间戳
    const expireAt = Date.now() + days * 24 * 60 * 60 * 1000;

    // 构建载荷
    const payload: SharePayload = {
      resourceId,
      mode,
      expireAt,
    };

    // 将载荷转为 JSON 字符串
    const payloadStr = JSON.stringify(payload);

    // 使用 HMAC-SHA256 生成签名
    const hmac = crypto.createHmac("sha256", SHARE_SECRET_KEY);
    hmac.update(payloadStr);
    const signature = hmac.digest("hex");

    // 组合：载荷 + 分隔符 + 签名，然后 Base64 编码
    const combined = `${payloadStr}${SEPARATOR}${signature}`;
    return Buffer.from(combined).toString("base64");
  }

  /**
   * 验证分享签名
   * @param sign Base64 编码的签名字符串
   * @param resourceId 期望的资源 ID（用于验证是否匹配）
   * @returns 验证结果
   */
  verifySign(
    sign: string,
    resourceId: string
  ): { valid: boolean; error?: string; payload?: SharePayload } {
    try {
      // Base64 解码
      const combined = Buffer.from(sign, "base64").toString("utf8");

      // 分割载荷和签名
      const separatorIndex = combined.lastIndexOf(SEPARATOR);
      if (separatorIndex === -1) {
        return { valid: false, error: "签名格式无效" };
      }

      const payloadStr = combined.substring(0, separatorIndex);
      const signature = combined.substring(separatorIndex + 1);

      // 验证签名
      const hmac = crypto.createHmac("sha256", SHARE_SECRET_KEY);
      hmac.update(payloadStr);
      const expectedSignature = hmac.digest("hex");

      if (signature !== expectedSignature) {
        return { valid: false, error: "签名验证失败，链接可能被篡改" };
      }

      // 解析载荷
      const payload: SharePayload = JSON.parse(payloadStr);

      // 验证资源 ID 是否匹配
      if (payload.resourceId !== resourceId) {
        return { valid: false, error: "资源 ID 不匹配" };
      }

      // 验证是否过期
      if (Date.now() > payload.expireAt) {
        return { valid: false, error: "分享链接已过期" };
      }

      return { valid: true, payload };
    } catch (error) {
      console.error("[ShareService] 验证签名失败:", error);
      return { valid: false, error: "签名解析失败" };
    }
  }

  /**
   * 仅解析签名（不验证资源 ID）
   * 用于获取签名中的模式信息
   */
  parseSign(sign: string): { valid: boolean; error?: string; payload?: SharePayload } {
    try {
      // Base64 解码
      const combined = Buffer.from(sign, "base64").toString("utf8");

      // 分割载荷和签名
      const separatorIndex = combined.lastIndexOf(SEPARATOR);
      if (separatorIndex === -1) {
        return { valid: false, error: "签名格式无效" };
      }

      const payloadStr = combined.substring(0, separatorIndex);
      const signature = combined.substring(separatorIndex + 1);

      // 验证签名
      const hmac = crypto.createHmac("sha256", SHARE_SECRET_KEY);
      hmac.update(payloadStr);
      const expectedSignature = hmac.digest("hex");

      if (signature !== expectedSignature) {
        return { valid: false, error: "签名验证失败" };
      }

      // 解析载荷
      const payload: SharePayload = JSON.parse(payloadStr);

      // 验证是否过期
      if (Date.now() > payload.expireAt) {
        return { valid: false, error: "分享链接已过期" };
      }

      return { valid: true, payload };
    } catch (error) {
      console.error("[ShareService] 解析签名失败:", error);
      return { valid: false, error: "签名解析失败" };
    }
  }
}

export default new ShareService();
