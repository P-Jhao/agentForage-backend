/**
 * 反馈模型
 * 存储用户对 AI 回复的评价反馈
 *
 * 反馈类型：
 * - like: 点赞
 * - dislike: 踩
 * - cancel: 取消反馈
 *
 * 每次提交都会创建新记录（保留历史），通过查询最新记录获取当前状态
 */
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../../config/database.js";

// 反馈类型
export type FeedbackType = "like" | "dislike" | "cancel";

interface FeedbackAttributes {
  id: number;
  taskId: number; // 关联 Conversation.id
  turnEndMessageId: number; // 关联 Message.id (type='turn_end')
  userId: number; // 关联 User.id
  type: FeedbackType;
  tags: string | null; // JSON 数组字符串
  content: string | null; // 详细内容
  createdAt?: Date; // 创建时间
  updatedAt?: Date; // 更新时间
}

type FeedbackCreationAttributes = Optional<FeedbackAttributes, "id" | "tags" | "content">;

class Feedback
  extends Model<FeedbackAttributes, FeedbackCreationAttributes>
  implements FeedbackAttributes
{
  declare id: number;
  declare taskId: number;
  declare turnEndMessageId: number;
  declare userId: number;
  declare type: FeedbackType;
  declare tags: string | null;
  declare content: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * 获取解析后的标签数组
   */
  getParsedTags(): string[] {
    if (!this.tags) return [];
    try {
      return JSON.parse(this.tags);
    } catch {
      return [];
    }
  }
}

Feedback.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    taskId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "任务 ID（关联 conversations.id）",
    },
    turnEndMessageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "轮次结束消息 ID（关联 messages.id）",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "反馈用户 ID（关联 users.id）",
    },
    type: {
      type: DataTypes.ENUM("like", "dislike", "cancel"),
      allowNull: false,
      comment: "反馈类型：like-点赞, dislike-踩, cancel-取消",
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: "快捷标签数组（JSON 格式）",
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: "详细反馈内容",
    },
  },
  {
    sequelize,
    tableName: "feedbacks",
    timestamps: true,
    underscored: true, // 使用下划线命名
    indexes: [
      // 任务+轮次联合索引，用于查询特定轮次的反馈
      { fields: ["task_id", "turn_end_message_id"] },
      // 用户索引，用于节流控制
      { fields: ["user_id"] },
      // 类型索引，用于后台筛选
      { fields: ["type"] },
      // 创建时间索引，用于后台时间范围筛选
      { fields: ["created_at"] },
    ],
  }
);

export default Feedback;
