/**
 * Sequelize 模型注册与关联
 */
import { sequelize } from "../../config/database.js";
import User from "./User.js";
import Agent from "./Agent.js";
import Conversation from "./Conversation.js";
import Message from "./Message.js";
import Document from "./Document.js";

// 定义模型关联
User.hasMany(Conversation, { foreignKey: "userId", as: "conversations" });
Conversation.belongsTo(User, { foreignKey: "userId", as: "user" });

Agent.hasMany(Conversation, { foreignKey: "agentId", as: "conversations" });
Conversation.belongsTo(Agent, { foreignKey: "agentId", as: "agent" });

Conversation.hasMany(Message, { foreignKey: "conversationId", as: "messages" });
Message.belongsTo(Conversation, { foreignKey: "conversationId", as: "conversation" });

User.hasMany(Document, { foreignKey: "userId", as: "documents" });
Document.belongsTo(User, { foreignKey: "userId", as: "user" });

export { sequelize, User, Agent, Conversation, Message, Document };
