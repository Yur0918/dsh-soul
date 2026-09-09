/**
 * dsh-soul v2 配置模型（schema.ts）
 *
 * 纯数据模块：字段常量、类型、默认值、限制值集中于此。
 * validate.ts 与 migrate.ts 均引用本模块，不重复定义魔法数字。
 *
 * 背景：dsh-soul v2（SoulFusion）为 v1 严格超集 ——
 *   v1 保留字段（enabled/nickname/occupation/bio/style/language/customInstructions/
 *   requireToolConfirmation/personas）+ dsh-soul-md 字段（cards/cardActive/cardSessions/
 *   cardWorkspaces/workspaceList/memory.*）+ 新增板块（evolution/audit/behavior/importedFrom）。
 */

/** 当前配置版本；缺失/0 视为 v1，启动时走 migrate。 */
export const SCHEMA_VERSION = 2 as const;

/** 版本标志：合法 version 只能是 2（v1 无 version 字段，迁移时补写）。 */
export const VALID_VERSIONS = [2] as const;

/** 字段长度 / 数量限制（UTF-16 code unit 计数） */
export const LIMITS = {
  nickname: 50,
  occupation: 50,
  bio: 500,
  customInstructions: 2000,
  personaName: 50,
  personasMax: 20,
  cardName: 100,
  cardContent: 16 * 1024, // 16KB / 卡（超限拒绝保存）
  cardMax: 20,
} as const;

/**
 * v2 风格枚举（9 值）。
 * `humorous` 为 v2 新增第 9 风格（按 review_B P0-1：v1 的 humorous 语义不得静默映射丢失）。
 */
export const STYLE_IDS = [
  'default',
  'professional',
  'friendly',
  'straight',
  'whimsical',
  'pragmatic',
  'roast',
  'coaching',
  'humorous',
] as const;

export type StyleId = (typeof STYLE_IDS)[number];

/** 特质级别（heading/emoji 各取其一） */
export const TRAIT_LEVELS = ['default', 'more', 'less'] as const;
export type TraitLevel = (typeof TRAIT_LEVELS)[number];

export interface Traits {
  /** 标题与列表 */
  headings: TraitLevel;
  /** 表情符号 */
  emoji: TraitLevel;
}

export const TRAITS_DEFAULT: Traits = { headings: 'default', emoji: 'default' };

/** 输出语言（同时控制编译产物的语言与 /soul 输出语言） */
export const LANGUAGE_IDS = ['zh', 'en'] as const;
export type Language = (typeof LANGUAGE_IDS)[number];

/** 记忆板块默认（沿用 dsh-soul-md） */
export const MEMORY_DEFAULTS = {
  /** 记忆域总大小上限（字节），超限拒绝写入 */
  maxBytes: 1048576,
  /** 是否注入 `soul:memory` 段 */
  inject: true,
  /** 注入段字符上限（取文件头） */
  injectMaxChars: 8000,
  /** 记忆段 order（位于 soul:persona 0.1 之后） */
  order: 0.5,
} as const;

export interface MemorySettings {
  maxBytes: number;
  inject: boolean;
  injectMaxChars: number;
  order: number;
}

/** 演化 / 记忆写入模式 */
export const EVOLUTION_MODES = ['confirm', 'auto', 'off'] as const;
export type EvolutionMode = (typeof EVOLUTION_MODES)[number];

export interface EvolutionSettings {
  /** soul_update：自演化（把稳定特质折叠进卡片/人设） */
  soulUpdateMode: EvolutionMode;
  /** memory_rewrite：改写记忆 */
  memoryRewriteMode: EvolutionMode;
  /** memory_append：追加记忆（低风险，默认 auto） */
  memoryAppendMode: EvolutionMode;
}

export const EVOLUTION_DEFAULTS: EvolutionSettings = {
  soulUpdateMode: 'confirm',
  memoryRewriteMode: 'confirm',
  memoryAppendMode: 'auto',
};

/** 审计板块默认 */
export const AUDIT_DEFAULTS = {
  enabled: true,
  /** 审计日志上限（字节），达到后轮转保留最近条目 */
  maxBytes: 1048576,
} as const;

export interface AuditSettings {
  enabled: boolean;
  maxBytes: number;
}

/** 文件变更详情模式（summary 默认；diff 需显式开启——隐私取舍，见计划 §6.3） */
export const FILE_CHANGE_MODES = ['summary', 'diff'] as const;
export type FileChangeMode = (typeof FILE_CHANGE_MODES)[number];

export const BEHAVIOR_DEFAULTS = {
  welcome: {
    enabled: false,
    text: '',
    showEveryTime: false,
    seenSessionIds: [] as string[],
  },
  fileChanges: {
    enabled: false,
    mode: 'summary' as FileChangeMode,
    maxLines: 40,
  },
} as const;

export interface BehaviorSettings {
  welcome: {
    enabled: boolean;
    text: string;
    showEveryTime: boolean;
    /** 插件自维护的「已展示欢迎语」会话列表（有界；review_B P0-2：不得复用 cardSessions） */
    seenSessionIds: string[];
  };
  fileChanges: {
    enabled: boolean;
    mode: FileChangeMode;
    maxLines: number;
  };
}

/** 人设卡来源 */
export const CARD_SOURCES = ['user', 'import', 'evolution', 'system'] as const;
export type CardSource = (typeof CARD_SOURCES)[number];

export interface CardV2 {
  id: string;
  name: string;
  /** markdown 正文，≤16KB */
  content: string;
  /** ISO8601 */
  updatedAt: string;
  source: CardSource;
}

/** 人设预设快照（沿用 v1 模型：name → 结构化字段快照 + updatedAt；卡片/行为不入快照） */
export interface PersonaSnapshot {
  nickname: string;
  occupation: string;
  bio: string;
  style: StyleId;
  traits: Traits;
  language: Language;
  customInstructions: string;
  updatedAt?: string;
}

/**
 * dsh-soul v2 配置（soul-config.json 内存形态）
 */
export interface SoulConfigV2 {
  version: typeof SCHEMA_VERSION;
  /** 个性化总开关：false 时停用注入与记忆/行为（配置保留） */
  enabled: boolean;
  nickname: string;
  occupation: string;
  bio: string;
  style: StyleId;
  traits: Traits;
  language: Language;
  customInstructions: string;
  /** set_persona 是否需要 /soul confirm（v1 语义保留） */
  requireToolConfirmation: boolean;
  /** 人设预设库：name → 快照（v1 模型保留） */
  personas: Record<string, PersonaSnapshot>;
  /** 人设卡：id 索引（v2 结构化，md 导入时 name→content 包一层） */
  cards: CardV2[];
  /** 默认人设卡 id；空 = 默认不启用卡片 */
  cardActive: string | null;
  /** 会话级选择：sessionId → card id / 'none' / ''（会话头切换写入） */
  cardSessions: Record<string, string>;
  /** workspace 级选择：workspace path → card id / 'none' / '' */
  cardWorkspaces: Record<string, string>;
  /** 只读 workspace 列表（host 维护） */
  workspaceList: string[];
  memory: MemorySettings;
  evolution: EvolutionSettings;
  audit: AuditSettings;
  behavior: BehaviorSettings;
  /** 迁移标记（幂等）：'dsh-soul-v1' | 'dsh-soul-md' | 'dsh-soul-md@legacy' | null */
  importedFrom: string | null;
}

/** 生成全字段默认配置（v2 基线） */
export function createDefaultConfig(): SoulConfigV2 {
  return {
    version: SCHEMA_VERSION,
    enabled: true,
    nickname: '',
    occupation: '',
    bio: '',
    style: 'default',
    traits: { ...TRAITS_DEFAULT },
    language: 'zh',
    customInstructions: '',
    requireToolConfirmation: false,
    personas: {},
    cards: [],
    cardActive: null,
    cardSessions: {},
    cardWorkspaces: {},
    workspaceList: [],
    memory: { ...MEMORY_DEFAULTS },
    evolution: { ...EVOLUTION_DEFAULTS },
    audit: { ...AUDIT_DEFAULTS },
    behavior: {
      welcome: {
        enabled: BEHAVIOR_DEFAULTS.welcome.enabled,
        text: BEHAVIOR_DEFAULTS.welcome.text,
        showEveryTime: BEHAVIOR_DEFAULTS.welcome.showEveryTime,
        seenSessionIds: [],
      },
      fileChanges: {
        enabled: BEHAVIOR_DEFAULTS.fileChanges.enabled,
        mode: BEHAVIOR_DEFAULTS.fileChanges.mode,
        maxLines: BEHAVIOR_DEFAULTS.fileChanges.maxLines,
      },
    },
    importedFrom: null,
  };
}

/** 判断是否为 v1 配置（缺失 version 或 version=0/1） */
export function isV1Config(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const v = (raw as Record<string, unknown>).version;
  return v === undefined || v === 0 || v === 1;
}

/** 判断是否已是 v2 配置 */
export function isV2Config(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && (raw as Record<string, unknown>).version === SCHEMA_VERSION;
}
