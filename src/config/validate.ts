/**
 * 配置校验（validate.ts）
 *
 * 策略（沿用 v1，见 review_B §2.1）：
 *  - 字段白名单：未知字段整单拒绝（不静默丢弃，不做部分接受）；
 *  - 类型校验：字段类型不匹配 → 字段级错误；
 *  - 长度上限：nickname/occupation ≤50、bio ≤500、customInstructions ≤2000、
 *    cards[].content ≤16KB、personas 键 ≤50 等（见 schema.LIMITS）；
 *  - 枚举校验：style / traits.* / language / evolution.* / card.source 等；
 *  - 任一错误 → { ok:false, errors:[字段级明细] }，合法 → { ok:true, value }。
 */
import {
  SCHEMA_VERSION,
  STYLE_IDS,
  TRAIT_LEVELS,
  LANGUAGE_IDS,
  EVOLUTION_MODES,
  CARD_SOURCES,
  LIMITS,
  MEMORY_DEFAULTS,
  AUDIT_DEFAULTS,
  EVOLUTION_DEFAULTS,
  BEHAVIOR_DEFAULTS,
} from './schema';
import type {
  SoulConfigV2,
  StyleId,
  TraitLevel,
  Language,
  EvolutionMode,
  CardSource,
  PersonaSnapshot,
  CardV2,
  FileChangeMode,
} from './schema';

export interface ValidationError {
  /** 字段路径，如 "memory.injectMaxChars"、"cards[2].content" */
  path: string;
  issue: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; value: SoulConfigV2 }
  | { ok: false; errors: ValidationError[]; rejectAll?: boolean };

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isEnum<T extends string>(v: unknown, values: readonly T[]): v is T {
  return typeof v === 'string' && (values as readonly string[]).includes(v);
}

/** Unicode code point 计数（中文按 1 算） */
export function charCount(s: string): number {
  return [...s].length;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 顶层字段白名单 */
const KNOWN_TOP_KEYS = new Set<string>([
  'version', 'enabled', 'nickname', 'occupation', 'bio', 'style', 'traits', 'language',
  'customInstructions', 'requireToolConfirmation', 'personas', 'cards', 'cardActive',
  'cardSessions', 'cardWorkspaces', 'workspaceList', 'memory', 'evolution', 'audit',
  'behavior', 'importedFrom',
]);

const KNOWN_TRAITS_KEYS = new Set(['headings', 'emoji']);
const KNOWN_MEMORY_KEYS = new Set(['maxBytes', 'inject', 'injectMaxChars', 'order']);
const KNOWN_EVOLUTION_KEYS = new Set(['soulUpdateMode', 'memoryRewriteMode', 'memoryAppendMode']);
const KNOWN_AUDIT_KEYS = new Set(['enabled', 'maxBytes']);
const KNOWN_BEHAVIOR_KEYS = new Set(['welcome', 'fileChanges']);
const KNOWN_WELCOME_KEYS = new Set(['enabled', 'text', 'showEveryTime', 'seenSessionIds']);
const KNOWN_FILECHANGES_KEYS = new Set(['enabled', 'mode', 'maxLines']);
const KNOWN_CARD_KEYS = new Set(['id', 'name', 'content', 'updatedAt', 'source']);
const SNAPSHOT_KEYS = new Set([
  'nickname', 'occupation', 'bio', 'style', 'traits', 'language', 'customInstructions', 'updatedAt',
]);

/** 顶层字段白名单（供外部引用/测试） */
export const KNOWN_FIELDS = KNOWN_TOP_KEYS;

/**
 * 校验一份待保存的 v2 配置。
 * 输入可以是部分字段（未提供字段回退默认值），但提供的字段必须合法；
 * 未知字段 → 整单拒绝（rejectAll: true）。
 */
export function validateConfig(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: '$root', issue: 'not-object', message: '配置必须是 JSON 对象' }] };
  }

  let rejectAll = false;

  // ---- 白名单（顶层 + 嵌套）：未知字段整单拒绝 ----
  for (const key of Object.keys(input)) {
    if (!KNOWN_TOP_KEYS.has(key)) {
      rejectAll = true;
      errors.push({
        path: key,
        issue: 'unknown-field',
        message: `未知字段 "${key}"：整单拒绝，不做静默丢弃`,
      });
    }
  }
  rejectAll ||= collectUnknownNestedKeys(input, errors);

  const out = buildConfig(input, errors);

  if (errors.length > 0) {
    return { ok: false, errors, rejectAll };
  }
  return { ok: true, value: out };
}

function collectUnknownNestedKeys(input: Record<string, unknown>, errors: ValidationError[]): boolean {
  let bad = false;
  const check = (obj: unknown, path: string, allowed: Set<string>) => {
    if (!isRecord(obj)) return;
    for (const k of Object.keys(obj)) {
      if (!allowed.has(k)) {
        bad = true;
        errors.push({ path: `${path}.${k}`, issue: 'unknown-field', message: `未知字段 "${path}.${k}"：整单拒绝` });
      }
    }
  };
  check(input.traits, 'traits', KNOWN_TRAITS_KEYS);
  check(input.memory, 'memory', KNOWN_MEMORY_KEYS);
  check(input.evolution, 'evolution', KNOWN_EVOLUTION_KEYS);
  check(input.audit, 'audit', KNOWN_AUDIT_KEYS);
  check(input.behavior, 'behavior', KNOWN_BEHAVIOR_KEYS);
  if (isRecord(input.behavior)) {
    check((input.behavior as Record<string, unknown>).welcome, 'behavior.welcome', KNOWN_WELCOME_KEYS);
    check((input.behavior as Record<string, unknown>).fileChanges, 'behavior.fileChanges', KNOWN_FILECHANGES_KEYS);
  }
  if (isRecord(input.personas)) {
    for (const [name, snap] of Object.entries(input.personas as Record<string, unknown>)) {
      if (isRecord(snap)) {
        for (const k of Object.keys(snap)) {
          if (!SNAPSHOT_KEYS.has(k)) {
            bad = true;
            errors.push({ path: `personas.${name}.${k}`, issue: 'unknown-field', message: `未知字段 "personas.${name}.${k}"：整单拒绝` });
          }
        }
      }
    }
  }
  if (Array.isArray(input.cards)) {
    input.cards.forEach((c, i) => {
      if (!isRecord(c)) return;
      for (const k of Object.keys(c)) {
        if (!KNOWN_CARD_KEYS.has(k)) {
          bad = true;
          errors.push({ path: `cards[${i}].${k}`, issue: 'unknown-field', message: `未知字段 "cards[${i}].${k}"：整单拒绝` });
        }
      }
    });
  }
  return bad;
}

/** 组装校验后的配置；错误写入 errors（路径级明细） */
function buildConfig(input: Record<string, unknown>, errors: ValidationError[]): SoulConfigV2 {
  const base: SoulConfigV2 = {
    version: SCHEMA_VERSION,
    enabled: true,
    nickname: '',
    occupation: '',
    bio: '',
    style: 'default',
    traits: { headings: 'default', emoji: 'default' },
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

  const err = (path: string, issue: string, message: string) => {
    errors.push({ path, issue, message });
    return false;
  };

  // ---- version：必须是 2 ----
  if (input.version !== undefined) {
    if (input.version !== SCHEMA_VERSION) {
      err('version', 'invalid-version', `version 必须为 ${SCHEMA_VERSION}（v1 配置请先执行 migrate）`);
    } else {
      base.version = SCHEMA_VERSION;
    }
  }

  // ---- enabled ----
  if (input.enabled !== undefined) {
    if (isBool(input.enabled)) base.enabled = input.enabled;
    else err('enabled', 'invalid-type', 'enabled 必须是 boolean');
  }

  // ---- 短字符串字段 ----
  const strField = (key: string, max: number) => {
    const v = input[key];
    if (v === undefined) return;
    if (!isStr(v)) {
      err(key, 'invalid-type', `${key} 必须是 string`);
      return;
    }
    if (charCount(v) > max) {
      err(key, 'too-long', `${key} 长度 ${charCount(v)} 超过上限 ${max}`);
      return;
    }
    (base as unknown as Record<string, string>)[key] = v;
  };
  strField('nickname', LIMITS.nickname);
  strField('occupation', LIMITS.occupation);
  strField('bio', LIMITS.bio);
  strField('customInstructions', LIMITS.customInstructions);

  // ---- style ----
  if (input.style !== undefined) {
    if (isEnum<StyleId>(input.style, STYLE_IDS)) base.style = input.style;
    else err('style', 'invalid-enum', `style 必须是 ${STYLE_IDS.join('/')} 之一，得到 "${String(input.style)}"`);
  }

  // ---- traits ----
  if (input.traits !== undefined) {
    if (!isRecord(input.traits)) {
      err('traits', 'invalid-type', 'traits 必须是 {headings, emoji} 对象');
    } else {
      const t = input.traits as Record<string, unknown>;
      if (t.headings !== undefined) {
        if (isEnum<TraitLevel>(t.headings, TRAIT_LEVELS)) base.traits.headings = t.headings;
        else err('traits.headings', 'invalid-enum', `traits.headings 必须是 ${TRAIT_LEVELS.join('/')} 之一`);
      }
      if (t.emoji !== undefined) {
        if (isEnum<TraitLevel>(t.emoji, TRAIT_LEVELS)) base.traits.emoji = t.emoji;
        else err('traits.emoji', 'invalid-enum', `traits.emoji 必须是 ${TRAIT_LEVELS.join('/')} 之一`);
      }
    }
  }

  // ---- language ----
  if (input.language !== undefined) {
    if (isEnum<Language>(input.language, LANGUAGE_IDS)) base.language = input.language;
    else err('language', 'invalid-enum', `language 必须是 ${LANGUAGE_IDS.join('/')} 之一`);
  }

  // ---- requireToolConfirmation ----
  if (input.requireToolConfirmation !== undefined) {
    if (isBool(input.requireToolConfirmation)) base.requireToolConfirmation = input.requireToolConfirmation;
    else err('requireToolConfirmation', 'invalid-type', 'requireToolConfirmation 必须是 boolean');
  }

  // ---- personas：Record<name, PersonaSnapshot> ----
  if (input.personas !== undefined) {
    if (!isRecord(input.personas)) {
      err('personas', 'invalid-type', 'personas 必须是 {name: 快照} 对象');
    } else {
      const entries = Object.entries(input.personas as Record<string, unknown>);
      if (charCount(Object.keys(input.personas as Record<string, unknown>).join('')) === 0) {
        // empty ok
      }
      for (const [name, snap] of entries) {
        if (charCount(name) > LIMITS.personaName) {
          err(`personas.${name}`, 'too-long', `personas 键名 "${name}" 超过上限 ${LIMITS.personaName}`);
          continue;
        }
        if (!isRecord(snap)) {
          err(`personas.${name}`, 'invalid-type', `personas.${name} 必须是对象快照`);
          continue;
        }
        base.personas[name] = buildSnapshot(name, snap, errors);
      }
    }
  }

  // ---- cards：CardV2[] ----
  if (input.cards !== undefined) {
    if (!Array.isArray(input.cards)) {
      err('cards', 'invalid-type', 'cards 必须是数组');
    } else {
      if (input.cards.length > LIMITS.cardMax) {
        err('cards', 'too-many', `cards 数量 ${input.cards.length} 超过上限 ${LIMITS.cardMax}`);
      }
      input.cards.forEach((c, i) => {
        if (!isRecord(c)) {
          err(`cards[${i}]`, 'invalid-type', `cards[${i}] 必须是对象`);
          return;
        }
        const cc = c as Record<string, unknown>;
        if (cc.id !== undefined && (!isStr(cc.id) || charCount(cc.id) === 0)) {
          err(`cards[${i}].id`, 'invalid-id', `cards[${i}].id 必须是非空字符串`);
        }
        if (cc.name !== undefined && (!isStr(cc.name) || charCount(cc.name) > LIMITS.cardName)) {
          err(`cards[${i}].name`, 'too-long', `cards[${i}].name 必须是非空字符串且 ≤${LIMITS.cardName}`);
        }
        if (cc.content !== undefined) {
          if (!isStr(cc.content)) {
            err(`cards[${i}].content`, 'invalid-type', `cards[${i}].content 必须是 string`);
          } else if (charCount(cc.content) > LIMITS.cardContent) {
            err(`cards[${i}].content`, 'too-long', `cards[${i}].content 长度 ${charCount(cc.content)} 超过上限 ${LIMITS.cardContent}（16KB）`);
          }
        }
        if (cc.updatedAt !== undefined && !isStr(cc.updatedAt)) {
          err(`cards[${i}].updatedAt`, 'invalid-type', `cards[${i}].updatedAt 必须是 ISO 字符串`);
        }
        if (cc.source !== undefined) {
          if (isEnum<CardSource>(cc.source, CARD_SOURCES)) {
            base.cards.push({
              id: isStr(cc.id) ? cc.id : `card-${i + 1}`,
              name: isStr(cc.name) ? cc.name : `卡 ${i + 1}`,
              content: isStr(cc.content) ? cc.content : '',
              updatedAt: isStr(cc.updatedAt) ? cc.updatedAt : new Date(0).toISOString(),
              source: cc.source,
            });
            // id 需唯一
            const dup = base.cards.filter((x) => x.id === base.cards[base.cards.length - 1].id).length > 1;
            if (dup) err(`cards[${i}].id`, 'duplicate-id', `cards[${i}].id "${String(cc.id)}" 与已有卡片重复`);
          } else {
            err(`cards[${i}].source`, 'invalid-enum', `cards[${i}].source 必须是 ${CARD_SOURCES.join('/')} 之一`);
          }
        } else {
          base.cards.push({
            id: isStr(cc.id) ? cc.id : `card-${i + 1}`,
            name: isStr(cc.name) ? cc.name : `卡 ${i + 1}`,
            content: isStr(cc.content) ? cc.content : '',
            updatedAt: isStr(cc.updatedAt) ? cc.updatedAt : new Date(0).toISOString(),
            source: 'user',
          });
        }
      });
    }
  }

  // ---- cardActive / cardSessions / cardWorkspaces / workspaceList ----
  if (input.cardActive !== undefined) {
    if (input.cardActive === null || isStr(input.cardActive)) base.cardActive = input.cardActive as string | null;
    else err('cardActive', 'invalid-type', 'cardActive 必须是字符串或 null');
  }
  if (input.cardSessions !== undefined) {
    if (!isRecord(input.cardSessions)) {
      err('cardSessions', 'invalid-type', 'cardSessions 必须是 {sessionId: cardId} 对象');
    } else {
      for (const [k, v] of Object.entries(input.cardSessions as Record<string, unknown>)) {
        if (!isStr(v)) {
          err(`cardSessions.${k}`, 'invalid-type', `cardSessions.${k} 必须是字符串（卡 id / 'none' / ''）`);
        } else {
          base.cardSessions[k] = v;
        }
      }
    }
  }
  if (input.cardWorkspaces !== undefined) {
    if (!isRecord(input.cardWorkspaces)) {
      err('cardWorkspaces', 'invalid-type', 'cardWorkspaces 必须是 {workspacePath: cardId} 对象');
    } else {
      for (const [k, v] of Object.entries(input.cardWorkspaces as Record<string, unknown>)) {
        if (!isStr(v)) {
          err(`cardWorkspaces.${k}`, 'invalid-type', `cardWorkspaces.${k} 必须是字符串`);
        } else {
          base.cardWorkspaces[k] = v;
        }
      }
    }
  }
  if (input.workspaceList !== undefined) {
    if (!Array.isArray(input.workspaceList) || !input.workspaceList.every(isStr)) {
      err('workspaceList', 'invalid-type', 'workspaceList 必须是字符串数组');
    } else {
      base.workspaceList = [...input.workspaceList];
    }
  }

  // ---- memory ----
  if (input.memory !== undefined) {
    if (!isRecord(input.memory)) {
      err('memory', 'invalid-type', 'memory 必须是对象');
    } else {
      const m = input.memory as Record<string, unknown>;
      if (m.maxBytes !== undefined) {
        if (isNum(m.maxBytes) && m.maxBytes > 0) base.memory.maxBytes = m.maxBytes;
        else err('memory.maxBytes', 'invalid-number', 'memory.maxBytes 必须是正数');
      }
      if (m.inject !== undefined) {
        if (isBool(m.inject)) base.memory.inject = m.inject;
        else err('memory.inject', 'invalid-type', 'memory.inject 必须是 boolean');
      }
      if (m.injectMaxChars !== undefined) {
        if (isNum(m.injectMaxChars) && m.injectMaxChars > 0) base.memory.injectMaxChars = m.injectMaxChars;
        else err('memory.injectMaxChars', 'invalid-number', 'memory.injectMaxChars 必须是正数');
      }
      if (m.order !== undefined) {
        if (isNum(m.order) && m.order >= 0 && m.order <= 1) base.memory.order = m.order;
        else err('memory.order', 'invalid-number', 'memory.order 必须是 [0,1] 区间数字');
      }
    }
  }

  // ---- evolution ----
  if (input.evolution !== undefined) {
    if (!isRecord(input.evolution)) {
      err('evolution', 'invalid-type', 'evolution 必须是对象');
    } else {
      const e = input.evolution as Record<string, unknown>;
      (['soulUpdateMode', 'memoryRewriteMode', 'memoryAppendMode'] as const).forEach((k) => {
        if (e[k] !== undefined) {
          if (isEnum<EvolutionMode>(e[k], EVOLUTION_MODES)) base.evolution[k] = e[k];
          else err(`evolution.${k}`, 'invalid-enum', `evolution.${k} 必须是 ${EVOLUTION_MODES.join('/')} 之一`);
        }
      });
    }
  }

  // ---- audit ----
  if (input.audit !== undefined) {
    if (!isRecord(input.audit)) {
      err('audit', 'invalid-type', 'audit 必须是对象');
    } else {
      const a = input.audit as Record<string, unknown>;
      if (a.enabled !== undefined) {
        if (isBool(a.enabled)) base.audit.enabled = a.enabled;
        else err('audit.enabled', 'invalid-type', 'audit.enabled 必须是 boolean');
      }
      if (a.maxBytes !== undefined) {
        if (isNum(a.maxBytes) && a.maxBytes > 0) base.audit.maxBytes = a.maxBytes;
        else err('audit.maxBytes', 'invalid-number', 'audit.maxBytes 必须是正数');
      }
    }
  }

  // ---- behavior ----
  if (input.behavior !== undefined) {
    if (!isRecord(input.behavior)) {
      err('behavior', 'invalid-type', 'behavior 必须是对象');
    } else {
      const b = input.behavior as Record<string, unknown>;
      const w = b.welcome;
      if (w !== undefined) {
        if (!isRecord(w)) {
          err('behavior.welcome', 'invalid-type', 'behavior.welcome 必须是对象');
        } else {
          const ww = w as Record<string, unknown>;
          if (ww.enabled !== undefined) {
            if (isBool(ww.enabled)) base.behavior.welcome.enabled = ww.enabled;
            else err('behavior.welcome.enabled', 'invalid-type', '必须是 boolean');
          }
          if (ww.text !== undefined) {
            if (isStr(ww.text) && charCount(ww.text) <= LIMITS.customInstructions) base.behavior.welcome.text = ww.text;
            else err('behavior.welcome.text', 'too-long', 'welcome.text 必须是字符串且 ≤2000');
          }
          if (ww.showEveryTime !== undefined) {
            if (isBool(ww.showEveryTime)) base.behavior.welcome.showEveryTime = ww.showEveryTime;
            else err('behavior.welcome.showEveryTime', 'invalid-type', '必须是 boolean');
          }
          if (ww.seenSessionIds !== undefined) {
            if (Array.isArray(ww.seenSessionIds) && ww.seenSessionIds.every(isStr)) {
              base.behavior.welcome.seenSessionIds = [...ww.seenSessionIds];
            } else {
              err('behavior.welcome.seenSessionIds', 'invalid-type', '必须是字符串数组');
            }
          }
        }
      }
      const fc = b.fileChanges;
      if (fc !== undefined) {
        if (!isRecord(fc)) {
          err('behavior.fileChanges', 'invalid-type', 'behavior.fileChanges 必须是对象');
        } else {
          const ff = fc as Record<string, unknown>;
          if (ff.enabled !== undefined) {
            if (isBool(ff.enabled)) base.behavior.fileChanges.enabled = ff.enabled;
            else err('behavior.fileChanges.enabled', 'invalid-type', '必须是 boolean');
          }
          if (ff.mode !== undefined) {
            if (isStr(ff.mode) && (['summary', 'diff'] as const).includes(ff.mode as 'summary' | 'diff')) {
              base.behavior.fileChanges.mode = ff.mode as FileChangeMode;
            } else {
              err('behavior.fileChanges.mode', 'invalid-enum', `fileChanges.mode 必须是 summary/diff`);
            }
          }
          if (ff.maxLines !== undefined) {
            if (isNum(ff.maxLines) && ff.maxLines > 0) base.behavior.fileChanges.maxLines = ff.maxLines;
            else err('behavior.fileChanges.maxLines', 'invalid-number', '必须是正数');
          }
        }
      }
    }
  }

  // ---- importedFrom ----
  if (input.importedFrom !== undefined) {
    if (input.importedFrom === null || isStr(input.importedFrom)) base.importedFrom = input.importedFrom as string | null;
    else err('importedFrom', 'invalid-type', 'importedFrom 必须是字符串或 null');
  }

  return base;
}

function buildSnapshot(name: string, snap: Record<string, unknown>, errors: ValidationError[]): PersonaSnapshot {
  const base: PersonaSnapshot = {
    nickname: '',
    occupation: '',
    bio: '',
    style: 'default',
    traits: { headings: 'default', emoji: 'default' },
    language: 'zh',
    customInstructions: '',
  };
  const err = (path: string, issue: string, message: string) => errors.push({ path: `personas.${name}.${path}`, issue, message });

  const strField = (key: keyof PersonaSnapshot, max: number) => {
    const v = snap[key];
    if (v === undefined) return;
    if (!isStr(v)) return err(String(key), 'invalid-type', '必须是 string');
    if (charCount(v) > max) return err(String(key), 'too-long', `长度 ${charCount(v)} 超过上限 ${max}`);
    (base as unknown as Record<string, unknown>)[key] = v;
  };
  strField('nickname', LIMITS.nickname);
  strField('occupation', LIMITS.occupation);
  strField('bio', LIMITS.bio);
  strField('customInstructions', LIMITS.customInstructions);

  if (snap.style !== undefined) {
    if (isEnum<StyleId>(snap.style, STYLE_IDS)) base.style = snap.style;
    else err('style', 'invalid-enum', `必须是 ${STYLE_IDS.join('/')} 之一`);
  }
  if (snap.traits !== undefined && isRecord(snap.traits)) {
    const t = snap.traits as Record<string, unknown>;
    if (t.headings !== undefined && isEnum<TraitLevel>(t.headings, TRAIT_LEVELS)) base.traits.headings = t.headings;
    if (t.emoji !== undefined && isEnum<TraitLevel>(t.emoji, TRAIT_LEVELS)) base.traits.emoji = t.emoji;
  }
  if (snap.language !== undefined) {
    if (isEnum<Language>(snap.language, LANGUAGE_IDS)) base.language = snap.language;
    else err('language', 'invalid-enum', `必须是 ${LANGUAGE_IDS.join('/')} 之一`);
  }
  if (snap.updatedAt !== undefined && isStr(snap.updatedAt)) base.updatedAt = snap.updatedAt;
  return base;
}
