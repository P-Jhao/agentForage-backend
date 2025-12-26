/**
 * 生成 RSA 密钥对和 AES 密钥
 * 运行: npx tsx scripts/generateKeys.ts
 */
import crypto from "crypto";

console.log("=== 生成加密密钥 ===\n");

// 生成 RSA 密钥对（2048 位）
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

// 生成 AES 密钥（32 字节随机字符串）
const aesKey = crypto.randomBytes(32).toString("hex");

console.log("请将以下内容添加到 .env 文件中：\n");
console.log("# RSA 公钥（用于前端加密）");
console.log(`RSA_PUBLIC_KEY="${publicKey.replace(/\n/g, "\\n")}"\n`);
console.log("# RSA 私钥（用于后端解密）");
console.log(`RSA_PRIVATE_KEY="${privateKey.replace(/\n/g, "\\n")}"\n`);
console.log("# AES 密钥（用于数据库存储加密）");
console.log(`AES_SECRET_KEY="${aesKey}"\n`);

console.log("=== 密钥生成完成 ===");
