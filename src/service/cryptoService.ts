/**
 * 加密服务
 * 提供 RSA 非对称加密（传输）和 AES 对称加密（存储）
 */
import crypto from "crypto";

// 从环境变量读取密钥
const RSA_PUBLIC_KEY = process.env.RSA_PUBLIC_KEY || "";
const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY || "";
const AES_SECRET_KEY = process.env.AES_SECRET_KEY || "";

// AES 配置
const AES_ALGORITHM = "aes-256-gcm";
const AES_IV_LENGTH = 16;
const AES_AUTH_TAG_LENGTH = 16;

class CryptoService {
  /**
   * 获取 RSA 公钥（供前端使用）
   */
  getPublicKey(): string {
    if (!RSA_PUBLIC_KEY) {
      throw new Error("RSA 公钥未配置，请设置环境变量 RSA_PUBLIC_KEY");
    }
    return RSA_PUBLIC_KEY;
  }

  /**
   * RSA 解密（使用私钥解密前端传来的数据）
   * @param encryptedData Base64 编码的加密数据
   */
  rsaDecrypt(encryptedData: string): string {
    if (!RSA_PRIVATE_KEY) {
      throw new Error("RSA 私钥未配置，请设置环境变量 RSA_PRIVATE_KEY");
    }

    try {
      const buffer = Buffer.from(encryptedData, "base64");
      const decrypted = crypto.privateDecrypt(
        {
          key: RSA_PRIVATE_KEY,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        buffer
      );
      return decrypted.toString("utf8");
    } catch (error) {
      console.error("[CryptoService] RSA 解密失败:", error);
      throw new Error("RSA 解密失败，数据可能被篡改");
    }
  }

  /**
   * AES 加密（用于数据库存储）
   * @param plainText 明文
   * @returns Base64 编码的加密数据（包含 IV 和 AuthTag）
   */
  aesEncrypt(plainText: string): string {
    if (!AES_SECRET_KEY) {
      throw new Error("AES 密钥未配置，请设置环境变量 AES_SECRET_KEY");
    }

    // 生成随机 IV
    const iv = crypto.randomBytes(AES_IV_LENGTH);

    // 从密钥字符串生成 32 字节密钥
    const key = crypto.scryptSync(AES_SECRET_KEY, "salt", 32);

    // 创建加密器
    const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv);

    // 加密
    let encrypted = cipher.update(plainText, "utf8", "hex");
    encrypted += cipher.final("hex");

    // 获取认证标签
    const authTag = cipher.getAuthTag();

    // 组合：IV + AuthTag + 密文
    const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, "hex")]);

    return combined.toString("base64");
  }

  /**
   * AES 解密（从数据库读取时使用）
   * @param encryptedData Base64 编码的加密数据
   */
  aesDecrypt(encryptedData: string): string {
    if (!AES_SECRET_KEY) {
      throw new Error("AES 密钥未配置，请设置环境变量 AES_SECRET_KEY");
    }

    try {
      // 解析组合数据
      const combined = Buffer.from(encryptedData, "base64");
      const iv = combined.subarray(0, AES_IV_LENGTH);
      const authTag = combined.subarray(AES_IV_LENGTH, AES_IV_LENGTH + AES_AUTH_TAG_LENGTH);
      const encrypted = combined.subarray(AES_IV_LENGTH + AES_AUTH_TAG_LENGTH);

      // 从密钥字符串生成 32 字节密钥
      const key = crypto.scryptSync(AES_SECRET_KEY, "salt", 32);

      // 创建解密器
      const decipher = crypto.createDecipheriv(AES_ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      // 解密
      let decrypted = decipher.update(encrypted.toString("hex"), "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      console.error("[CryptoService] AES 解密失败:", error);
      throw new Error("AES 解密失败，数据可能已损坏");
    }
  }

  /**
   * 检查加密服务是否可用
   */
  isAvailable(): { rsa: boolean; aes: boolean } {
    return {
      rsa: !!RSA_PUBLIC_KEY && !!RSA_PRIVATE_KEY,
      aes: !!AES_SECRET_KEY,
    };
  }
}

export default new CryptoService();
