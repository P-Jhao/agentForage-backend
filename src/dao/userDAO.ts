/**
 * 用户数据访问对象
 */
import { User } from "./models/index.js";
import type { CustomModelConfig } from "./models/User.js";
import CryptoService from "../service/cryptoService.js";

interface CreateUserData {
  username: string;
  nickname: string;
  password: string;
}

// 用户资料更新数据
interface UpdateProfileData {
  nickname?: string;
  avatar?: string | null;
  email?: string | null;
}

class UserDAO {
  static async create(userData: CreateUserData) {
    return await User.create(userData);
  }

  static async findById(id: number) {
    return await User.findByPk(id);
  }

  static async findByUsername(username: string) {
    return await User.findOne({ where: { username } });
  }

  static async updateById(id: number, data: Partial<CreateUserData>) {
    return await User.update(data, { where: { id } });
  }

  /**
   * 更新用户资料（头像、邮箱等）
   */
  static async updateProfile(userId: number, data: UpdateProfileData): Promise<boolean> {
    const [affectedRows] = await User.update(data, { where: { id: userId } });
    return affectedRows > 0;
  }

  /**
   * 更新用户密码
   */
  static async updatePassword(userId: number, hashedPassword: string): Promise<boolean> {
    const [affectedRows] = await User.update(
      { password: hashedPassword },
      { where: { id: userId } }
    );
    return affectedRows > 0;
  }

  /**
   * 获取用户的模型配置
   * 自动解密 apiKey
   */
  static async getModelConfig(userId: number): Promise<CustomModelConfig | null> {
    const user = await User.findByPk(userId, {
      attributes: ["modelConfig"],
    });
    const config = user?.modelConfig;
    if (!config) return null;

    // 如果有加密的 apiKey，解密后返回
    if (config.apiKey && config.mode === "custom") {
      try {
        config.apiKey = CryptoService.aesDecrypt(config.apiKey);
      } catch (error) {
        console.error("[UserDAO] 解密 apiKey 失败:", error);
        // 解密失败时返回空，避免泄露加密数据
        config.apiKey = "";
      }
    }

    return config;
  }

  /**
   * 更新用户的模型配置
   * 自动加密 apiKey 后存储
   */
  static async updateModelConfig(userId: number, config: CustomModelConfig): Promise<boolean> {
    // 如果有 apiKey，加密后存储
    const configToSave = { ...config };
    if (configToSave.apiKey && configToSave.mode === "custom") {
      try {
        configToSave.apiKey = CryptoService.aesEncrypt(configToSave.apiKey);
      } catch (error) {
        console.error("[UserDAO] 加密 apiKey 失败:", error);
        throw new Error("加密 apiKey 失败");
      }
    }

    const [affectedRows] = await User.update(
      { modelConfig: configToSave },
      { where: { id: userId } }
    );
    return affectedRows > 0;
  }
}

export default UserDAO;
export type { CustomModelConfig };
