/**
 * 文档/知识库服务
 */
import DocumentDAO from "../dao/documentDAO.js";

interface UploadParams {
  userId: number;
  filename: string;
  content: string;
}

interface SearchParams {
  userId: number;
  query: string;
  topK?: number;
  scoreThreshold?: number;
}

class DocumentService {
  /**
   * 上传文档
   */
  static async uploadDocument({ userId, filename, content }: UploadParams) {
    // TODO: 文档解析、分块、向量化
    const document = await DocumentDAO.create({ userId, filename });
    return document;
  }

  /**
   * 获取用户文档列表
   */
  static async getDocumentList(userId: number) {
    return await DocumentDAO.findByUserId(userId);
  }

  /**
   * RAG 语义检索
   */
  static async search({ userId, query, topK = 5, scoreThreshold = 0.7 }: SearchParams) {
    // TODO: 向量检索实现
    return [];
  }

  /**
   * 删除文档
   */
  static async deleteDocument(documentId: number) {
    await DocumentDAO.deleteById(documentId);
  }
}

export default DocumentService;
