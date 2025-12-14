/**
 * 用户模型
 */
import { DataTypes } from "sequelize";
import { sequelize } from "../../config/database.js";

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: "用户名",
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "密码（加密）",
    },
    apiQuota: {
      type: DataTypes.INTEGER,
      defaultValue: 1000,
      comment: "API 调用配额",
    },
  },
  {
    tableName: "users",
    timestamps: true,
  }
);

export default User;
