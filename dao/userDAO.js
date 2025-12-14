/**
 * 用户数据访问对象
 */
import { User } from "./models/index.js";

class UserDAO {
  static async create(userData) {
    return await User.create(userData);
  }

  static async findById(id) {
    return await User.findByPk(id);
  }

  static async findByUsername(username) {
    return await User.findOne({ where: { username } });
  }

  static async updateById(id, data) {
    return await User.update(data, { where: { id } });
  }
}

export default UserDAO;
