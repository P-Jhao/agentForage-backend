/**
 * 用户服务
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import UserDAO from "../dao/userDAO.js";

interface RegisterParams {
  username: string;
  password: string;
}

interface LoginResult {
  token: string;
  user: {
    id: number;
    username: string;
  };
}

class UserService {
  /**
   * 用户注册
   */
  static async register({ username, password }: RegisterParams) {
    if (!username || !password) {
      throw Object.assign(new Error("用户名和密码不能为空"), { status: 400 });
    }

    const existing = await UserDAO.findByUsername(username);
    if (existing) {
      throw Object.assign(new Error("用户名已存在"), { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await UserDAO.create({ username, password: hashedPassword });

    return { id: user.id, username: user.username };
  }

  /**
   * 用户登录
   */
  static async login({ username, password }: RegisterParams): Promise<LoginResult> {
    const user = await UserDAO.findByUsername(username);
    if (!user) {
      throw Object.assign(new Error("用户名或密码错误"), { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw Object.assign(new Error("用户名或密码错误"), { status: 401 });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    return { token, user: { id: user.id, username: user.username } };
  }

  /**
   * 获取用户信息
   */
  static async getUserInfo(userId: number) {
    const user = await UserDAO.findById(userId);
    if (!user) {
      throw Object.assign(new Error("用户不存在"), { status: 404 });
    }
    return { id: user.id, username: user.username, apiQuota: user.apiQuota };
  }
}

export default UserService;
