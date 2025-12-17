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
import ForgeFavorite from "./ForgeFavorite.js";

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

export { sequelize, User, Agent, Conversation, Message, Document, Mcp, ForgeFavorite };
