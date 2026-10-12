/**
 * 人设快照（personas）操作 —— v1 对齐面（v1 有 soulConfig 服务与 /api/soul/personas
 * 端点；v2 此前只有配置内嵌 personas 字段，无独立读写面）。
 *
 * 纯函数：不做 IO。端点层负责持久化（saveConfig）与整卡校验（validateConfig）。
 *  - upsertPersona(config, key, snapshot)   → 新配置
 *  - deletePersona(config, key)             → 新配置 + 是否真的删除了
 *  - personasPayload(config)                → GET 响应载荷（列表 + 计数 + 上限）
 */
import { LIMITS } from './schema';

const PERSONAS_MAX = LIMITS.personasMax;
import type { PersonaSnapshot, SoulConfigV2 } from './schema';

function isPersonaSnapshot(v: unknown): v is PersonaSnapshot {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  // schema 校验是权威；这里只做端点层的形状速断
  return typeof r.style === 'string';
}

export class PersonaError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function upsertPersona(config: SoulConfigV2, key: string, snapshot: unknown): SoulConfigV2 {
  const name = key.trim();
  if (name === '') throw new PersonaError('persona key required', 400);
  if (name.length > 50) throw new PersonaError(`persona key too long (max 50): ${name.length}`, 400);
  if (!isPersonaSnapshot(snapshot)) {
    throw new PersonaError('persona snapshot must be an object with at least a style field', 400);
  }
  const existing = config.personas ?? {};
  const isNew = !(name in existing);
  if (isNew && Object.keys(existing).length >= PERSONAS_MAX) {
    throw new PersonaError(`persona limit reached (max ${PERSONAS_MAX}); delete one first`, 400);
  }
  return { ...config, personas: { ...existing, [name]: snapshot as PersonaSnapshot } };
}

export function deletePersona(config: SoulConfigV2, key: string): { config: SoulConfigV2; deleted: boolean } {
  const name = key.trim();
  const existing = config.personas ?? {};
  if (!(name in existing)) return { config, deleted: false };
  const next = { ...existing };
  delete next[name];
  return { config: { ...config, personas: next }, deleted: true };
}

export function personasPayload(config: SoulConfigV2): {
  ok: true;
  count: number;
  max: number;
  personas: Record<string, PersonaSnapshot>;
} {
  const personas = config.personas ?? {};
  return { ok: true, count: Object.keys(personas).length, max: PERSONAS_MAX, personas };
}
