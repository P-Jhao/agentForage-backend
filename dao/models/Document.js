/**
 * 文档模型
 */
import { DataTypes } from "sequelize";
import { sequelize } from "../../config/database.js";

const Document = sequelize.define(
  "Document",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "用户 ID",
    },
    filename: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "文件名",
    },
    fileType: {
      type: DataTypes.STRING(50),
      comment: "文件类型",
    },
    fileSize: {
      type: DataTypes.INTEGER,
      comment: "文件大小（字节）",
    },
    chunkCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "分块数量",
    },
    status: {
      type: DataTypes.ENUM("pending", "processing", "completed", "failed"),
      defaultValue: "pending",
      comment: "处理状态",
    },
  },
  {
    tableName: "documents",
    timestamps: true,
  }
);

export default Document;
