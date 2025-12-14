/**
 * 文档/知识库服务
 */
import DocumentDAO from "../dao/documentDAO.js";

class DocumentService {
  /**
   * 上传文档
   */
  static async uploadDocument({ userId, filename, content }) {
    // TODO: 文档解析、分块、向量化
    const document = await DocumentDAO.create({ userId, filename, content });
    return document;
  }

  /**
   * 获取用户文档列表
   */
  static async getDocumentList(userId) {
    return await DocumentDAO.findByUserId(userId);
  }

  /**
   * RAG 语义检索
   */
  static async search({ userId, query, topK = 5, scoreThreshold = 0.7 }) {
    // TODO: 向量检索实现
    return [];
  }

  /**
   * 删除文档
   */
  static async deleteDocument(documentId) {
    await DocumentDAO.deleteById(documentId);
  }
}

export default DocumentService;
