/**
 * 配置迁移（migrate.ts）
 *
 * 两条迁移路径（均不覆盖原文件；原数据由调用方持久化为备份）：
 *  1) dsh-soul v1 → v2：style 别名表 + traits 归一化 + 备份标记；
 *  2) dsh-soul-md → v2：cards/active/sessions/workspaces/memory.* 字段映射，
 *     md ≤ v0.4 legacy path 字段（path/cardPath/legacyPath/memory.path）兜底；
 * 幂等：importedFrom 已标记则跳过（二次运行无副作用）。
 */
import {
  SCHEMA_VERSION,
  STYLE_IDS,
  TRAIT_LEVELS,
  LANGUAGE_IDS,
  EVOLUTION_DEFAULTS,
  MEMORY_DEFAULTS,
  AUDIT_DEFAULTS,
  createDefaultConfig,
} from './schema';
import type {
  SoulConfigV2,
  StyleId,
  Traits,
  TraitLevel,
  Language,
  CardV2,
  CardSource,
  PersonaSnapshot,
} from './schema';
import { isRecord } from './validate';

/* ============================ v1 → v2 ============================ */

/**
 * v1 style 别名表（review_B P0-1 定稿：humorous 保留为第 9 风格，不并入 whimsical）。
 * v1 枚举共 5 值：professional / casual / humorous / roast / efficient；
 * 另含 v2 同名校（friendly 等）直通，便于手工改装过的 v1 配置迁移。
 */
export const V1_STYLE_ALIAS: Record<string, StyleId> = {
  // v1 → v2 别名映射
  professional: 'professional',
  roast: 'roast',
  efficient: 'pragmatic', // 高效干练 → 高效务实
  casual: 'friendly', // 轻松自然 → 亲和友善（温暖度增强，迁移日志注明）
  humorous: 'humorous', // 保留第 9 风格（v1 语义保真，不并入 whimsical）
  // v2 同名字段直通
  default: 'default',
  friendly: 'friendly',
  straight: 'straight',
  whimsical: 'whimsical',
  pragmatic: 'pragmatic',
  coaching: 'coaching',
};

/** 非法/未知值 → default（迁移日志警告） */
export function resolveV1Style(value: unknown): { style: StyleId; mapped: boolean; raw: unknown } {
  const raw = value;
  if (typeof value === 'string' && V1_STYLE_ALIAS[value]) {
    return { style: V1_STYLE_ALIAS[value], mapped: value !== V1_STYLE_ALIAS[value], raw };
  }
  return { style: 'default', mapped: true, raw };
}

export const V1_FLAT_TRAIT_KEYS = ['traitHeadings', 'traitEmoji', 'headings', 'emoji'] as const;

/**
 * traits 归一化：v1 实际形态无 README 依据（review_B 第 1 项存疑），
 * 兼容三种形态：对象 {headings, emoji} / 平铺 traitHeadings+traitEmoji / 缺失。
 */
export function normalizeTraitsV1(raw: unknown): Traits {
  const out: Traits = { headings: 'default', emoji: 'default' };
  const pick = (v: unknown): TraitLevel =>
    typeof v === 'string' && (TRAIT_LEVELS as readonly string[]).includes(v) ? (v as TraitLevel) : 'default';
  if (isRecord(raw)) {
    out.headings = pick(raw.headings ?? raw.traitHeadings);
    out.emoji = pick(raw.emoji ?? raw.traitEmoji);
  }
  return out;
}

export interface V1MigrationResult {
  config: SoulConfigV2;
  warnings: string[];
  meta: {
    from: 'v1';
    /** 原 v1 配置原始值（备份标记：调用方应持久化为 soul-config.v1.bak.json） */
    backup: unknown;
    styleMap: { raw: unknown; mapped: StyleId; alias: boolean };
  };
}

/** 幂等：已标记导入来源则跳过 */
export function isImported(current: SoulConfigV2 | null | undefined, source: string): boolean {
  return current?.importedFrom === source;
}

/** v1 → v2 迁移 */
export function migrateV1ToV2(raw: unknown, current?: SoulConfigV2 | null): V1MigrationResult {
  const warnings: string[] = [];
  const src = isRecord(raw) ? raw : {};

  if (current?.importedFrom === 'dsh-soul-v1') {
    warnings.push('已标记 importedFrom=dsh-soul-v1，跳过重复迁移（幂等）');
  }

  const styleResult = resolveV1Style(src.style);
  if (typeof src.style !== 'string') {
    warnings.push('v1 配置缺少 style 字段，回退为 default');
  } else if (styleResult.mapped && src.style !== styleResult.style) {
    warnings.push(`v1 风格 "${String(src.style)}" 映射为 "${styleResult.style}"`);
    if (src.style === 'casual') warnings.push('casual→friendly 差异提示：v2「亲和友善」增加温度/鼓励维度，语气更温暖');
  }

  // 兼容 v1 平铺形态（traitHeadings/traitEmoji 在顶层）与对象形态（traits）
  const wasFlat = src.traitHeadings !== undefined || src.traitEmoji !== undefined;
  const traits = normalizeTraitsV1(wasFlat ? { headings: src.traitHeadings, emoji: src.traitEmoji } : src.traits);
  if (wasFlat) warnings.push('v1 traits 为平铺字段（traitHeadings/traitEmoji），已归一化为 {headings, emoji} 对象');

  const snapshots = normalizePersonasV1(src.personas);

  const config: SoulConfigV2 = {
    ...createDefaultConfig(),
    version: SCHEMA_VERSION,
    enabled: typeof src.enabled === 'boolean' ? src.enabled : createDefaultConfig().enabled,
    nickname: typeof src.nickname === 'string' ? src.nickname : '',
    occupation: typeof src.occupation === 'string' ? src.occupation : '',
    bio: typeof src.bio === 'string' ? src.bio : '',
    style: styleResult.style,
    traits,
    language: typeof src.language === 'string' && (LANGUAGE_IDS as readonly string[]).includes(src.language)
      ? (src.language as Language)
      : 'zh',
    customInstructions: typeof src.customInstructions === 'string' ? src.customInstructions : '',
    requireToolConfirmation: typeof src.requireToolConfirmation === 'boolean' ? src.requireToolConfirmation : false,
    personas: snapshots,
    importedFrom: 'dsh-soul-v1',
  };

  return {
    config,
    warnings,
    meta: {
      from: 'v1',
      backup: raw,
      styleMap: { raw: src.style, mapped: styleResult.style, alias: styleResult.mapped },
    },
  };
}

function normalizePersonasV1(raw: unknown): Record<string, PersonaSnapshot> {
  const out: Record<string, PersonaSnapshot> = {};
  if (!isRecord(raw)) return out;
  for (const [name, snapRaw] of Object.entries(raw)) {
    if (!isRecord(snapRaw)) continue;
    const styleResult = resolveV1Style(snapRaw.style);
    out[name] = {
      nickname: typeof snapRaw.nickname === 'string' ? snapRaw.nickname : '',
      occupation: typeof snapRaw.occupation === 'string' ? snapRaw.occupation : '',
      bio: typeof snapRaw.bio === 'string' ? snapRaw.bio : '',
      style: styleResult.style,
      traits: normalizeTraitsV1(snapRaw.traits),
      language: typeof snapRaw.language === 'string' && (LANGUAGE_IDS as readonly string[]).includes(snapRaw.language)
        ? (snapRaw.language as Language)
        : 'zh',
      customInstructions: typeof snapRaw.customInstructions === 'string' ? snapRaw.customInstructions : '',
      updatedAt: typeof snapRaw.updatedAt === 'string' ? snapRaw.updatedAt : undefined,
    };
  }
  return out;
}

/* ============================ md → v2 ============================ */

/** md ≤ v0.4 legacy 字段候选（file-based：卡片在 path/fallback/complete 等字段里） */
export const MD_LEGACY_PATH_KEYS = ['path', 'cardPath', 'legacyPath'] as const;

export interface MdMigrationResult {
  skipped: boolean;
  config: SoulConfigV2;
  warnings: string[];
  meta?: { from: 'dsh-soul-md'; legacy: boolean; importedCards: number };
}

export interface MdImportInput {
  /** settings 命名空间中的 soul-md 配置（或其中一部分） */
  [key: string]: unknown;
}

/**
 * dsh-soul-md → v2 一次性导入。
 * @param input   md 配置对象（cards/active/sessions/workspaces/memory/legacy path…）
 * @param current 当前 v2 配置（若已 importedFrom=dsh-soul-md 则幂等跳过）
 */
export function importFromMd(input: unknown, current?: SoulConfigV2 | null): MdMigrationResult {
  if (isImported(current ?? null, 'dsh-soul-md') || isImported(current ?? null, 'dsh-soul-md@legacy')) {
    return { skipped: true, config: current as SoulConfigV2, warnings: ['已标记 importedFrom=dsh-soul-md，跳过重复导入（幂等）'] };
  }

  const src = isRecord(input) ? input : {};
  const config: SoulConfigV2 = current ? structuredClone(current) : createDefaultConfig();
  const warnings: string[] = [];

  const legacyPath = pickLegacyPath(src);
  if (legacyPath !== undefined) {
    // md ≤ v0.4 file-based 老用户：卡片在旧 path 目录，本骨架不读真实文件，
    // 仅标记来源 + 提示（真实导入由宿主在 MV1 集成时实现：读取 path/fallback 卡为"默认"）
    config.importedFrom = 'dsh-soul-md@legacy';
    warnings.push(
      `检测到 dsh-soul-md ≤v0.4 legacy 路径字段 "${legacyPath}"（file-based 老版本）：` +
        `v2 仅保留来源标记，不再读写该路径；旧卡片/记忆文件请在 UI「清理旧数据」中确认或手动迁移`,
    );
  } else {
    config.importedFrom = 'dsh-soul-md';
  }

  // ---- cards：md 形态 name→content 字符串，包一层为 CardV2 ----
  let importedCards = 0;
  if (Array.isArray(src.cards)) {
    config.cards.push(...(src.cards as unknown[]).map((c) => wrapMdCard(c)).filter((c): c is CardV2 => c !== null));
    importedCards += (src.cards as unknown[]).length;
  } else if (isRecord(src.cards)) {
    for (const [name, content] of Object.entries(src.cards)) {
      const wrapped = wrapMdCard({ name, content });
      if (wrapped) config.cards.push(wrapped);
      importedCards++;
    }
  }
  if (config.cards.length > 0) warnings.push(`已导入 ${importedCards} 张人设卡（md 的 name→content 已包装为结构化卡片）`);

  // ---- active/sessions/workspaces ----
  if (typeof src.active === 'string') config.cardActive = src.active;
  if (isRecord(src.sessions)) {
    for (const [k, v] of Object.entries(src.sessions)) {
      if (typeof v === 'string') config.cardSessions[k] = v;
    }
  }
  if (isRecord(src.workspaces)) {
    for (const [k, v] of Object.entries(src.workspaces)) {
      if (typeof v === 'string') config.cardWorkspaces[k] = v;
    }
  }
  if (Array.isArray(src.workspaceList)) {
    config.workspaceList = (src.workspaceList as unknown[]).filter((x): x is string => typeof x === 'string');
  }

  // ---- memory.* ----
  if (isRecord(src.memory)) {
    const m = src.memory as Record<string, unknown>;
    if (typeof m.maxBytes === 'number' && m.maxBytes > 0) config.memory.maxBytes = m.maxBytes;
    if (typeof m.inject === 'boolean') config.memory.inject = m.inject;
    if (typeof m.injectMaxChars === 'number' && m.injectMaxChars > 0) config.memory.injectMaxChars = m.injectMaxChars;
    if (typeof m.order === 'number' && m.order >= 0 && m.order <= 1) config.memory.order = m.order;
    if (typeof m.path === 'string') {
      warnings.push(`md memory.path "${m.path}" 为 legacy 字段：v2 不使用该路径，仅记录`);
    }
  }

  return {
    skipped: false,
    config,
    warnings,
    meta: { from: 'dsh-soul-md', legacy: legacyPath !== undefined, importedCards: importedCards },
  };
}

function pickLegacyPath(src: Record<string, unknown>): string | undefined {
  for (const k of MD_LEGACY_PATH_KEYS) {
    if (typeof src[k] === 'string' && (src[k] as string).length > 0) return src[k] as string;
  }
  if (isRecord(src.memory) && typeof (src.memory as Record<string, unknown>).path === 'string') {
    return (src.memory as Record<string, unknown>).path as string;
  }
  return undefined;
}

/** 单条 md 卡片包装：兼容 {name, content} 对象与纯字符串 content（source=import） */
export function wrapMdCard(raw: unknown): CardV2 | null {
  if (typeof raw === 'string') {
    return {
      id: slugId('card'),
      name: '默认',
      content: raw,
      updatedAt: new Date().toISOString(),
      source: 'import',
    };
  }
  if (!isRecord(raw)) return null;
  const name = typeof raw.name === 'string' && raw.name ? raw.name : '默认';
  const content = typeof raw.content === 'string' ? raw.content : '';
  const body = typeof raw.body === 'string' ? raw.body : '';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : slugId(name),
    name,
    content: content || body,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    source: (typeof raw.source === 'string' ? (raw.source as CardSource) : 'import') as CardSource,
  };
}

function slugId(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '');
  return `card-${base || 'unnamed'}`;
}
