/**
 * dsh-soul v2（SoulFusion）包入口 —— 纯函数 API 汇聚。
 *
 * ⚠️ 本骨架【不包含】真实 DSH 插件装配：
 *   - bridge/ 仅接口声明（systemPrompt/inject），无真实调用；
 *   - ui/ 仅组件清单注释（tsconfig 已排除）；
 *   - 真实装配（cordis.patch.yml + index.ts 钩子）在 MV1 集成期完成。
 */
export {
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
  createDefaultConfig,
  isV1Config,
  isV2Config,
} from './config/schema';
export type {
  SoulConfigV2,
  StyleId,
  TraitLevel,
  Traits,
  Language,
  EvolutionMode,
  EvolutionSettings,
  MemorySettings,
  AuditSettings,
  BehaviorSettings,
  CardV2,
  CardSource,
  PersonaSnapshot,
} from './config/schema';
export { validateConfig } from './config/validate';
export type { ValidationError, ValidationResult } from './config/validate';
export {
  migrateV1ToV2,
  importFromMd,
  resolveV1Style,
  V1_STYLE_ALIAS,
  normalizeTraitsV1,
  wrapMdCard,
  isImported,
} from './config/migrate';
export type { V1MigrationResult, MdMigrationResult } from './config/migrate';
export { STYLES, getStyle } from './prompt/styles';
export type { StylePreset } from './prompt/styles';
export { compilePrompt, GLOBAL_NOTE, resolveActiveCard } from './prompt/compilePrompt';
export type { CompiledPrompt } from './prompt/compilePrompt';
export { SECTION_ORDER, SECTION_NAMES } from './prompt/sections';
export { MemoryService, slugify, truncateHead } from './memory/service';
export type { MemoryWriteResult } from './memory/service';
export { AuditLog, AUDIT_STATUSES } from './memory/audit';
export type { AuditEntry, AuditStatus, AuditEntryInput } from './memory/audit';
export { PendingRegistry, SLOT_TOOLS } from './memory/confirm';
export type { SlotTool, PendingEnqueueInput } from './memory/confirm';
export { buildSectionRegistrations } from './bridge/systemPrompt';
export type { SectionRegistration, SystemPromptBinding } from './bridge/systemPrompt';
export { buildInjectionPoints } from './bridge/inject';
export type { InjectionPoint, InjectBinding } from './bridge/inject';
