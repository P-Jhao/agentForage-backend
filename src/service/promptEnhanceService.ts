/**
 * 提示词增强服务
 * 处理三种增强模式的流程：快速增强、智能迭代、多角度增强
 */
import { promptEnhancerService } from "agentforge-gateway";
import type { SmartIterateContext } from "agentforge-gateway";
import MessageDAO from "../dao/messageDAO.js";
import TaskStreamService from "./taskStreamService.js";
import TaskAbortService from "./taskAbortService.js";

// 增强模式类型
export type EnhanceMode = "off" | "quick" | "smart" | "multi";

// 智能迭代上下文（前端传入）
export interface IterateContext {
  originalPrompt: string;
  reviewerOutput: string;
  questionerOutput: string;
}

// 增强结果
export interface EnhanceResult {
  success: boolean;
  enhancedPrompt: string; // 增强后的提示词
  error?: string;
}

/**
 * 提示词增强服务类
 */
class PromptEnhanceService {
  /**
   * 执行快速增强
   * @param uuid 任务 UUID
   * @param conversationId 会话 ID
   * @param userPrompt 用户原始提示词
   * @returns 增强结果
   */
  async quickEnhance(
    uuid: string,
    conversationId: number,
    userPrompt: string
  ): Promise<EnhanceResult> {
    let enhancedPrompt = "";

    try {
      // 流式输出增强过程
      for await (const chunk of promptEnhancerService.quickEnhance(userPrompt)) {
        // 检查是否已被中断
        if (TaskAbortService.isAborted(uuid)) {
          console.log(`[PromptEnhanceService] 快速增强被中断: ${uuid}`);
          // 保存已累积的增强内容（标记为已中断）
          if (enhancedPrompt) {
            await MessageDAO.createEnhanceProcessMessage(
              conversationId,
              "enhancer",
              enhancedPrompt + "\n\n[已中断]"
            );
          }
          return { success: false, enhancedPrompt: userPrompt, error: "任务已被中断" };
        }

        if (chunk.type === "error") {
          // 增强失败，返回错误
          return {
            success: false,
            enhancedPrompt: userPrompt,
            error: chunk.data,
          };
        }

        if (chunk.type === "enhancer" && chunk.data) {
          enhancedPrompt += chunk.data;
          // 流式推送给前端
          TaskStreamService.write(uuid, { type: "enhancer", data: chunk.data });
        }
      }

      // 保存增强后的提示词到数据库
      await MessageDAO.createEnhanceProcessMessage(conversationId, "enhancer", enhancedPrompt);

      return {
        success: true,
        enhancedPrompt,
      };
    } catch (error) {
      console.error("[PromptEnhanceService] 快速增强失败:", error);
      return {
        success: false,
        enhancedPrompt: userPrompt,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 执行智能迭代 - 审查和提问阶段
   * 此方法在用户首次发送消息时调用，输出审查结果和澄清问题后等待用户回复
   * @param uuid 任务 UUID
   * @param conversationId 会话 ID
   * @param userPrompt 用户原始提示词
   * @returns 是否成功完成审查和提问阶段
   */
  async smartReviewAndQuestion(
    uuid: string,
    conversationId: number,
    userPrompt: string
  ): Promise<{ success: boolean; reviewerOutput: string; questionerOutput: string }> {
    let reviewerOutput = "";
    let questionerOutput = "";

    try {
      // 第一阶段：审查
      for await (const chunk of promptEnhancerService.smartReview(userPrompt)) {
        // 检查是否已被中断
        if (TaskAbortService.isAborted(uuid)) {
          console.log(`[PromptEnhanceService] 智能迭代审查被中断: ${uuid}`);
          // 保存已累积的审查内容（标记为已中断）
          if (reviewerOutput) {
            await MessageDAO.createEnhanceProcessMessage(
              conversationId,
              "reviewer",
              reviewerOutput + "\n\n[已中断]"
            );
          }
          return { success: false, reviewerOutput: "", questionerOutput: "" };
        }

        if (chunk.type === "error") {
          return { success: false, reviewerOutput: "", questionerOutput: "" };
        }

        if (chunk.type === "reviewer" && chunk.data) {
          reviewerOutput += chunk.data;
          TaskStreamService.write(uuid, { type: "reviewer", data: chunk.data });
        }
      }

      // 保存审查结果
      await MessageDAO.createEnhanceProcessMessage(conversationId, "reviewer", reviewerOutput);

      // 第二阶段：提问
      for await (const chunk of promptEnhancerService.smartQuestion(userPrompt, reviewerOutput)) {
        // 检查是否已被中断
        if (TaskAbortService.isAborted(uuid)) {
          console.log(`[PromptEnhanceService] 智能迭代提问被中断: ${uuid}`);
          // 保存已累积的提问内容（标记为已中断）
          if (questionerOutput) {
            await MessageDAO.createEnhanceProcessMessage(
              conversationId,
              "questioner",
              questionerOutput + "\n\n[已中断]"
            );
          }
          return { success: false, reviewerOutput, questionerOutput: "" };
        }

        if (chunk.type === "error") {
          return { success: false, reviewerOutput, questionerOutput: "" };
        }

        if (chunk.type === "questioner" && chunk.data) {
          questionerOutput += chunk.data;
          TaskStreamService.write(uuid, { type: "questioner", data: chunk.data });
        }
      }

      // 保存提问结果
      await MessageDAO.createEnhanceProcessMessage(conversationId, "questioner", questionerOutput);

      return { success: true, reviewerOutput, questionerOutput };
    } catch (error) {
      console.error("[PromptEnhanceService] 智能迭代审查/提问阶段失败:", error);
      return { success: false, reviewerOutput, questionerOutput };
    }
  }

  /**
   * 执行智能迭代 - 增强阶段
   * 此方法在用户回复澄清问题后调用
   * @param uuid 任务 UUID
   * @param conversationId 会话 ID
   * @param context 完整上下文
   * @returns 增强结果
   */
  async smartEnhance(
    uuid: string,
    conversationId: number,
    context: SmartIterateContext
  ): Promise<EnhanceResult> {
    let enhancedPrompt = "";

    try {
      for await (const chunk of promptEnhancerService.smartEnhance(context)) {
        // 检查是否已被中断
        if (TaskAbortService.isAborted(uuid)) {
          console.log(`[PromptEnhanceService] 智能迭代增强被中断: ${uuid}`);
          // 保存已累积的增强内容（标记为已中断）
          if (enhancedPrompt) {
            await MessageDAO.createEnhanceProcessMessage(
              conversationId,
              "enhancer",
              enhancedPrompt + "\n\n[已中断]"
            );
          }
          return { success: false, enhancedPrompt: context.originalPrompt, error: "任务已被中断" };
        }

        if (chunk.type === "error") {
          return {
            success: false,
            enhancedPrompt: context.originalPrompt,
            error: chunk.data,
          };
        }

        if (chunk.type === "enhancer" && chunk.data) {
          enhancedPrompt += chunk.data;
          TaskStreamService.write(uuid, { type: "enhancer", data: chunk.data });
        }
      }

      // 保存增强后的提示词
      await MessageDAO.createEnhanceProcessMessage(conversationId, "enhancer", enhancedPrompt);

      return {
        success: true,
        enhancedPrompt,
      };
    } catch (error) {
      console.error("[PromptEnhanceService] 智能迭代增强阶段失败:", error);
      return {
        success: false,
        enhancedPrompt: context.originalPrompt,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 执行多角度增强
   * @param uuid 任务 UUID
   * @param conversationId 会话 ID
   * @param userPrompt 用户原始提示词
   * @returns 增强结果
   */
  async multiEnhance(
    uuid: string,
    conversationId: number,
    userPrompt: string
  ): Promise<EnhanceResult> {
    let expertOutput = "";
    let enhancedPrompt = "";

    try {
      // 第一阶段：专家分析
      for await (const chunk of promptEnhancerService.multiExpertAnalyze(userPrompt)) {
        // 检查是否已被中断
        if (TaskAbortService.isAborted(uuid)) {
          console.log(`[PromptEnhanceService] 多角度专家分析被中断: ${uuid}`);
          // 保存已累积的专家分析内容（标记为已中断）
          if (expertOutput) {
            await MessageDAO.createEnhanceProcessMessage(
              conversationId,
              "expert",
              expertOutput + "\n\n[已中断]"
            );
          }
          return { success: false, enhancedPrompt: userPrompt, error: "任务已被中断" };
        }

        if (chunk.type === "error") {
          return {
            success: false,
            enhancedPrompt: userPrompt,
            error: chunk.data,
          };
        }

        if (chunk.type === "expert" && chunk.data) {
          expertOutput += chunk.data;
          TaskStreamService.write(uuid, { type: "expert", data: chunk.data });
        }
      }

      // 保存专家分析结果
      await MessageDAO.createEnhanceProcessMessage(conversationId, "expert", expertOutput);

      // 第二阶段：评审官综合
      for await (const chunk of promptEnhancerService.multiEnhance(userPrompt, expertOutput)) {
        // 检查是否已被中断
        if (TaskAbortService.isAborted(uuid)) {
          console.log(`[PromptEnhanceService] 多角度增强被中断: ${uuid}`);
          // 保存已累积的增强内容（标记为已中断）
          if (enhancedPrompt) {
            await MessageDAO.createEnhanceProcessMessage(
              conversationId,
              "enhancer",
              enhancedPrompt + "\n\n[已中断]"
            );
          }
          return { success: false, enhancedPrompt: userPrompt, error: "任务已被中断" };
        }

        if (chunk.type === "error") {
          return {
            success: false,
            enhancedPrompt: userPrompt,
            error: chunk.data,
          };
        }

        if (chunk.type === "enhancer" && chunk.data) {
          enhancedPrompt += chunk.data;
          TaskStreamService.write(uuid, { type: "enhancer", data: chunk.data });
        }
      }

      // 保存增强后的提示词
      await MessageDAO.createEnhanceProcessMessage(conversationId, "enhancer", enhancedPrompt);

      return {
        success: true,
        enhancedPrompt,
      };
    } catch (error) {
      console.error("[PromptEnhanceService] 多角度增强失败:", error);
      return {
        success: false,
        enhancedPrompt: userPrompt,
        error: (error as Error).message,
      };
    }
  }
}

export default new PromptEnhanceService();
