/**
 * 文档数据访问对象
 */
import { Document } from "./models/index.js";

interface CreateDocumentData {
  userId: number;
  filename: string;
  fileType?: string;
  fileSize?: number;
}

class DocumentDAO {
  static async create(data: CreateDocumentData) {
    return await Document.create(data);
  }

  static async findById(id: number) {
    return await Document.findByPk(id);
  }

  static async findByUserId(userId: number) {
    return await Document.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });
  }

  static async deleteById(id: number) {
    return await Document.destroy({ where: { id } });
  }
}

export default DocumentDAO;
