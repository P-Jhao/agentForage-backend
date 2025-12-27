/**
 * 用户服务
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import UserDAO from "../dao/userDAO.js";

interface RegisterParams {
  username: string;
  nickname: string;
  password: string;
}

interface LoginParams {
  username: string;
  password: string;
}

interface LoginResult {
  token: string;
  user: {
    id: number;
    username: string;
    nickname: string;
    role: "user" | "root" | "operator";
  };
}

interface ChangePasswordParams {
  userId: number;
  oldPassword: string;
  newPassword: string;
}

interface UpdateProfileParams {
  userId: number;
  nickname?: string;
  avatar?: string | null;
  email?: string | null;
}

class UserService {
  /**
   * 用户注册
   */
  static async register({ username, nickname, password }: RegisterParams) {
    if (!username || !password) {
      throw Object.assign(new Error("账号和密码不能为空"), { status: 400 });
    }
    if (username.length < 3 || username.length > 20) {
      throw Object.assign(new Error("账号长度需在 3-20 字符之间"), { status: 400 });
    }
    if (nickname && nickname.length > 20) {
      throw Object.assign(new Error("名称长度不能超过 20 字符"), { status: 400 });
    }
    if (password.length < 6 || password.length > 32) {
      throw Object.assign(new Error("密码长度需在 6-32 字符之间"), { status: 400 });
    }

    const existing = await UserDAO.findByUsername(username);
    if (existing) {
      throw Object.assign(new Error("账号已存在"), { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    // 如果没有提供名称，默认使用账号
    const user = await UserDAO.create({
      username,
      nickname: nickname || username,
      password: hashedPassword,
    });

    return { id: user.id, username: user.username, nickname: user.nickname };
  }

  /**
   * 用户登录
   */
  static async login({ username, password }: LoginParams): Promise<LoginResult> {
    const user = await UserDAO.findByUsername(username);
    if (!user) {
      throw Object.assign(new Error("账号或密码错误"), { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw Object.assign(new Error("账号或密码错误"), { status: 401 });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: user.role,
      },
    };
  }

  /**
   * 获取用户信息
   */
  static async getUserInfo(userId: number) {
    const user = await UserDAO.findById(userId);
    if (!user) {
      throw Object.assign(new Error("用户不存在"), { status: 404 });
    }
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      apiQuota: user.apiQuota,
      role: user.role,
    };
  }

  /**
   * 修改密码
   */
  static async changePassword({ userId, oldPassword, newPassword }: ChangePasswordParams) {
    // 验证新密码格式
    if (!newPassword || newPassword.length < 6 || newPassword.length > 32) {
      throw Object.assign(new Error("新密码长度需在 6-32 字符之间"), { status: 400 });
    }

    // 获取用户
    const user = await UserDAO.findById(userId);
    if (!user) {
      throw Object.assign(new Error("用户不存在"), { status: 404 });
    }

    // 验证旧密码
    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      throw Object.assign(new Error("原密码错误"), { status: 400 });
    }

    // 加密新密码并更新
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const success = await UserDAO.updatePassword(userId, hashedPassword);
    if (!success) {
      throw Object.assign(new Error("密码修改失败"), { status: 500 });
    }

    return { message: "密码修改成功" };
  }

  /**
   * 更新用户资料
   */
  static async updateProfile({ userId, nickname, avatar, email }: UpdateProfileParams) {
    // 验证名称长度
    if (nickname !== undefined && nickname.length > 20) {
      throw Object.assign(new Error("名称长度不能超过 20 字符"), { status: 400 });
    }

    // 验证邮箱格式（如果提供）
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw Object.assign(new Error("邮箱格式不正确"), { status: 400 });
    }

    const updateData: { nickname?: string; avatar?: string | null; email?: string | null } = {};
    if (nickname !== undefined) updateData.nickname = nickname;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (email !== undefined) updateData.email = email;

    if (Object.keys(updateData).length === 0) {
      throw Object.assign(new Error("没有需要更新的内容"), { status: 400 });
    }

    const success = await UserDAO.updateProfile(userId, updateData);
    if (!success) {
      throw Object.assign(new Error("更新失败"), { status: 500 });
    }

    return { message: "更新成功" };
  }
}

export default UserService;
