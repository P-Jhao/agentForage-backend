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
    role: "user" | "root";
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
    if (username.length < 3 || username.length > 20) {
      throw Object.assign(new Error("用户名长度需在 3-20 字符之间"), { status: 400 });
    }
    if (password.length < 6 || password.length > 32) {
      throw Object.assign(new Error("密码长度需在 6-32 字符之间"), { status: 400 });
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

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    return { token, user: { id: user.id, username: user.username, role: user.role } };
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
