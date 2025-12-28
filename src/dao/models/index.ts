/**
 * Sequelize 模型注册与关联
 */
import { sequelize } from "../../config/database.js";
import User from "./User.js";
import Agent from "./Agent.js";
import Conversation from "./Conversation.js";
import Message from "./Message.js";
import Document from "./Document.js";
import Mcp from "./Mcp.js";
import McpForge from "./McpForge.js";
import ForgeFavorite from "./ForgeFavorite.js";
import FeaturedTask from "./FeaturedTask.js";
import Feedback from "./Feedback.js";
import LoginLog from "./LoginLog.js";

// 定义模型关联
User.hasMany(Conversation, { foreignKey: "userId", as: "conversations" });
Conversation.belongsTo(User, { foreignKey: "userId", as: "user" });

Agent.hasMany(Conversation, { foreignKey: "agentId", as: "conversations" });
Conversation.belongsTo(Agent, { foreignKey: "agentId", as: "agent" });

Conversation.hasMany(Message, { foreignKey: "conversationId", as: "messages" });
Message.belongsTo(Conversation, { foreignKey: "conversationId", as: "conversation" });

User.hasMany(Document, { foreignKey: "userId", as: "documents" });
Document.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(Mcp, { foreignKey: "userId", as: "mcps" });
Mcp.belongsTo(User, { foreignKey: "userId", as: "user" });

// Forge（Agent）与 User 的关联
User.hasMany(Agent, { foreignKey: "userId", as: "forges" });
Agent.belongsTo(User, { foreignKey: "userId", as: "creator" });

// Forge 收藏关联
User.hasMany(ForgeFavorite, { foreignKey: "userId", as: "forgeFavorites" });
ForgeFavorite.belongsTo(User, { foreignKey: "userId", as: "user" });

Agent.hasMany(ForgeFavorite, { foreignKey: "forgeId", as: "favorites" });
ForgeFavorite.belongsTo(Agent, { foreignKey: "forgeId", as: "forge" });

// MCP 与 Forge 的多对多关联（通过 McpForge 中间表）
Mcp.belongsToMany(Agent, {
  through: McpForge,
  foreignKey: "mcpId",
  otherKey: "forgeId",
  as: "forges",
});
Agent.belongsToMany(Mcp, {
  through: McpForge,
  foreignKey: "forgeId",
  otherKey: "mcpId",
  as: "mcps",
});

// McpForge 与 Mcp、Agent 的关联（用于直接查询中间表）
McpForge.belongsTo(Mcp, { foreignKey: "mcpId", as: "mcp" });
McpForge.belongsTo(Agent, { foreignKey: "forgeId", as: "forge" });
Mcp.hasMany(McpForge, { foreignKey: "mcpId", as: "mcpForges" });
Agent.hasMany(McpForge, { foreignKey: "forgeId", as: "mcpForges" });

// FeaturedTask 与 Conversation 的关联
FeaturedTask.belongsTo(Conversation, { foreignKey: "taskUuid", targetKey: "uuid", as: "task" });
Conversation.hasOne(FeaturedTask, { foreignKey: "taskUuid", sourceKey: "uuid", as: "featured" });

// Feedback 与 Conversation、User、Message 的关联
Conversation.hasMany(Feedback, { foreignKey: "taskId", as: "feedbacks" });
Feedback.belongsTo(Conversation, { foreignKey: "taskId", as: "task" });

User.hasMany(Feedback, { foreignKey: "userId", as: "feedbacks" });
Feedback.belongsTo(User, { foreignKey: "userId", as: "user" });

Message.hasMany(Feedback, { foreignKey: "turnEndMessageId", as: "feedbacks" });
Feedback.belongsTo(Message, { foreignKey: "turnEndMessageId", as: "turnEndMessage" });

// LoginLog 与 User 的关联
User.hasMany(LoginLog, { foreignKey: "userId", as: "loginLogs" });
LoginLog.belongsTo(User, { foreignKey: "userId", as: "user" });

export {
  sequelize,
  User,
  Agent,
  Conversation,
  Message,
  Document,
  Mcp,
  McpForge,
  ForgeFavorite,
  FeaturedTask,
  Feedback,
  LoginLog,
};
