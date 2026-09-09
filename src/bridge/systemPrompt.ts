/**
 * DSH 运行时适配层 —— systemPrompt 绑定（bridge/systemPrompt.ts）
 *
 * ⚠️ 仅接口声明 + 注释，**不产生任何真实 DSH 调用**（本机 DSH 环境不污染）。
 * 真实实现由宿主插件（cordis.patch.yml + index.ts 装配）在 MV1 集成时绑定。
 *
 * 目标契约（待验证，见 sections.ts）：
 *   ctx.systemPrompt.section({ name: 'soul:persona', order: 0.1, text })
 *   ctx.systemPrompt.section({ name: 'soul:memory',  order: 0.5, text })
 *   官方 personaPrefix(order 0) / personaSuffix(order 10200) 为草案占位。
 *
 * 若上游 API 破坏：回退为 agent.inject 注入式（v1 已验证可行）。
 */
import type { SoulConfigV2 } from '../config/schema';
import { SECTION_ORDER, SECTION_NAMES } from '../prompt/sections';
import type { CompiledPrompt } from '../prompt/compilePrompt';

export interface SectionRegistration {
  name: string;
  order: number;
  text: string;
}

/** 适配层对外契约：把编译产物映射为注册点（纯数据，可单测） */
export function buildSectionRegistrations(prompt: CompiledPrompt): SectionRegistration[] {
  const regs: SectionRegistration[] = [];
  if (prompt.persona) {
    regs.push({ name: SECTION_NAMES.persona, order: SECTION_ORDER.persona, text: prompt.persona });
  }
  if (prompt.memory) {
    regs.push({ name: SECTION_NAMES.memory, order: SECTION_ORDER.memory, text: prompt.memory });
  }
  return regs;
}

/**
 * 宿主侧绑定接口声明（真实实现不在本骨架中）。
 * 接入真实 DSH 时按如下形状实现（名称以 spike 验证为准）：
 */
export interface SystemPromptBinding {
  /** 当前宿主系统提示词（只读） */
  getCurrent(): string;
  /**
   * 注册/更新 section。
   * 宿主实现参考：
   *   ctx.systemPrompt.section({ name, order, text });   // 名称待验证
   * 若该 API 不可用，可回退为 agent.inject(createUserMessage(snapshot)) 注入。
   */
  registerSection(reg: SectionRegistration): Promise<void>;
  /** 配置变更后热同步（沿用 v1：agent.inject 快照，下一次请求生效） */
  applyConfig(config: SoulConfigV2, compiled: CompiledPrompt): Promise<void>;
}

/** 占位实现（no-op）：仅用于类型缝合与测试，不触碰任何宿主 API */
export function createSystemPromptBindingStub(): SystemPromptBinding {
  let current = '';
  return {
    getCurrent: () => current,
    registerSection: async (reg: SectionRegistration) => {
      // no-op：骨架不注册真实 section；记录以保持可观测（内存）
      current = current || reg.text;
    },
    applyConfig: async () => {
      // no-op：骨架不注入
    },
  };
}
