/**
 * 用户数据访问对象
 */
import { User } from "./models/index.js";

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
}

export default UserDAO;
