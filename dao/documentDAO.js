/**
 * 文档数据访问对象
 */
import { Document } from "./models/index.js";

class DocumentDAO {
  static async create(data) {
    return await Document.create(data);
  }

  static async findById(id) {
    return await Document.findByPk(id);
  }

  static async findByUserId(userId) {
    return await Document.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });
  }

  static async deleteById(id) {
    return await Document.destroy({ where: { id } });
  }
}

export default DocumentDAO;
