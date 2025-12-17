/**
 * Forge 收藏模型
 * 用户与 Forge 的多对多收藏关系
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

interface ForgeFavoriteAttributes {
  id: number;
  userId: number; // 用户 ID
  forgeId: number; // Forge ID（关联 Agent 表）
}

type ForgeFavoriteCreationAttributes = Optional<ForgeFavoriteAttributes, "id">;

class ForgeFavorite
  extends Model<ForgeFavoriteAttributes, ForgeFavoriteCreationAttributes>
  implements ForgeFavoriteAttributes
{
  declare id: number;
  declare userId: number;
  declare forgeId: number;
  declare readonly createdAt: Date;
}

ForgeFavorite.init(
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
    forgeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Forge ID（关联 agents 表）",
    },
  },
  {
    sequelize,
    tableName: "forge_favorites",
    timestamps: true,
    updatedAt: false, // 收藏关系不需要 updatedAt
    indexes: [
      {
        unique: true,
        fields: ["user_id", "forge_id"],
        name: "unique_user_forge",
      },
    ],
  }
);

export default ForgeFavorite;
