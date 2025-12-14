/**
 * 文档/知识库相关路由
 */
import Router from "@koa/router";
import { tokenAuth } from "../middleware/index.js";
import DocumentService from "../service/documentService.js";

const router = new Router();

// 上传文档
router.post("/upload", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id;
  const { filename, content } = ctx.request.body;
  const result = await DocumentService.uploadDocument({
    userId,
    filename,
    content,
  });
  ctx.body = { code: 200, message: "上传成功", data: result };
});

// 获取文档列表
router.get("/list", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id;
  const result = await DocumentService.getDocumentList(userId);
  ctx.body = { code: 200, message: "ok", data: result };
});

// RAG 检索
router.post("/search", tokenAuth(), async (ctx) => {
  const userId = ctx.state.user.id;
  const { query, topK, scoreThreshold } = ctx.request.body;
  const result = await DocumentService.search({
    userId,
    query,
    topK,
    scoreThreshold,
  });
  ctx.body = { code: 200, message: "ok", data: result };
});

// 删除文档
router.delete("/:documentId", tokenAuth(), async (ctx) => {
  const { documentId } = ctx.params;
  await DocumentService.deleteDocument(documentId);
  ctx.body = { code: 200, message: "删除成功", data: null };
});

export default router;
