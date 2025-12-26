/**
 * 用户数据访问对象
 */
import { User } from "./models/index.js";
import type { CustomModelConfig } from "./models/User.js";

interface CreateUserData {
  username: string;
  password: string;
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
   * 获取用户的模型配置
   */
  static async getModelConfig(userId: number): Promise<CustomModelConfig | null> {
    const user = await User.findByPk(userId, {
      attributes: ["modelConfig"],
    });
    return user?.modelConfig ?? null;
  }

  /**
   * 更新用户的模型配置
   */
  static async updateModelConfig(userId: number, config: CustomModelConfig): Promise<boolean> {
    const [affectedRows] = await User.update({ modelConfig: config }, { where: { id: userId } });
    return affectedRows > 0;
  }
}

export default UserDAO;
export type { CustomModelConfig };
