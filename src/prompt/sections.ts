/**
 * 提示词分段（section）顺序常量 —— sections.ts
 *
 * 融合插件只注册一个 `soul:persona` section（内部合并"设置活性配置 ⊕ 人设卡"），
 * 记忆段为独立的 `soul:memory` section。
 *
 * 顺序约定（避免与官方占位段冲突，v1 注册在 order 0）：
 *  - soul:persona = 0.1 —— 紧随官方 persona 前缀之后；
 *  - soul:memory  = 0.5 —— 位于中段（persona 之后、任务指令之前）。
 *
 * ⚠️ 官方 DSH persona 前缀/后缀常量（personaPrefix / personaSuffix）为**草案，待验证**：
 *   其真实键名与 order 值（传闻 0 / 10200）在 DSH README 中未见记载，
 *   接入真实宿主前必须 spike 验证；本文件仅作占位声明，不作为契约。
 */
export const SECTION_ORDER = {
  /** soul:persona 段顺序 */
  persona: 0.1,
  /** soul:memory 段顺序 */
  memory: 0.5,
} as const;

export const SECTION_NAMES = {
  persona: 'soul:persona',
  memory: 'soul:memory',
} as const;

/** 草案占位：官方 persona 前缀（待验证；若 API 破坏，回退为 agent.inject 注入式） */
export const OFFICIAL_PERSONA_PREFIX_DRAFT = 'DSH_SOUL_PERSONA_PREFIX' as const;

/** 草案占位：官方 persona 后缀（待验证） */
export const OFFICIAL_PERSONA_SUFFIX_DRAFT = 'DSH_SOUL_PERSONA_SUFFIX' as const;

/** 草案占位：官方认为 persona 段应在的 order（待验证） */
export const OFFICIAL_PERSONA_ORDER_DRAFT = 0 as const;
export const OFFICIAL_PERSONA_SUFFIX_ORDER_DRAFT = 10200 as const;
