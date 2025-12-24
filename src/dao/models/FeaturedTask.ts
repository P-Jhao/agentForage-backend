/**
 * 推荐示例模型
 * 存储被管理员标记为推荐示例的任务
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

interface FeaturedTaskAttributes {
  id: number;
  taskUuid: string;
  coverImage: string | null;
  title: string | null;
  description: string | null;
  sortOrder: number;
}

type FeaturedTaskCreationAttributes = Optional<
  FeaturedTaskAttributes,
  "id" | "coverImage" | "title" | "description" | "sortOrder"
>;

class FeaturedTask
  extends Model<FeaturedTaskAttributes, FeaturedTaskCreationAttributes>
  implements FeaturedTaskAttributes
{
  declare id: number;
  declare taskUuid: string;
  declare coverImage: string | null;
  declare title: string | null;
  declare description: string | null;
  declare sortOrder: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

FeaturedTask.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    taskUuid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      unique: true,
      comment: "关联的任务 UUID",
    },
    coverImage: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: "封面图片路径",
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: true,
      defaultValue: null,
      comment: "自定义标题（为空时使用任务原标题）",
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: "描述",
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "排序权重，数值越大越靠前",
    },
  },
  {
    sequelize,
    tableName: "featured_tasks",
    timestamps: true,
  }
);

export default FeaturedTask;
