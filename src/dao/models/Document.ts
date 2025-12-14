/**
 * 文档模型
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

interface DocumentAttributes {
  id: number;
  userId: number;
  filename: string;
  fileType: string | null;
  fileSize: number | null;
  chunkCount: number;
  status: "pending" | "processing" | "completed" | "failed";
}

interface DocumentCreationAttributes extends Optional<DocumentAttributes, "id" | "fileType" | "fileSize" | "chunkCount" | "status"> {}

class Document extends Model<DocumentAttributes, DocumentCreationAttributes> implements DocumentAttributes {
  declare id: number;
  declare userId: number;
  declare filename: string;
  declare fileType: string | null;
  declare fileSize: number | null;
  declare chunkCount: number;
  declare status: "pending" | "processing" | "completed" | "failed";
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Document.init(
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
    sequelize,
    tableName: "documents",
    timestamps: true,
  }
);

export default Document;
