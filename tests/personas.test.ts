/**
 * personas 纯函数单测：v1 对齐端点（/dsh-soul/personas）背后的三层逻辑。
 * 只测纯函数，不碰网络与文件系统。
 */
import { describe, it, expect } from 'vitest';
import { upsertPersona, deletePersona, personasPayload, PersonaError } from '../src/config/personas';
import { createDefaultConfig } from '../src/config/schema';
import type { PersonaSnapshot } from '../src/config/schema';

const snap = (style = 'roast'): PersonaSnapshot => ({ style } as PersonaSnapshot);

describe('upsertPersona', () => {
  it('新增 persona：进入配置且不影响其他字段', () => {
    const base = { ...createDefaultConfig(), nickname: '保持' };
    const next = upsertPersona(base, '工作模式', snap('pragmatic'));
    expect(next.personas['工作模式']).toEqual({ style: 'pragmatic' });
    expect(next.nickname).toBe('保持');
    expect(base.personas).toEqual({}); // 原配置不被原地修改
  });

  it('同名覆盖：数量不变、快照替换', () => {
    let cfg = upsertPersona(createDefaultConfig(), 'a', snap('roast'));
    cfg = upsertPersona(cfg, 'a', snap('friendly'));
    expect(personasPayload(cfg).count).toBe(1);
    expect(cfg.personas['a'].style).toBe('friendly');
  });

  it('key 必填与长度上限', () => {
    expect(() => upsertPersona(createDefaultConfig(), '  ', snap())).toThrow(PersonaError);
    expect(() => upsertPersona(createDefaultConfig(), 'x'.repeat(51), snap())).toThrow(PersonaError);
  });

  it('快照必须是含 style 的对象', () => {
    expect(() => upsertPersona(createDefaultConfig(), 'a', null)).toThrow(PersonaError);
    expect(() => upsertPersona(createDefaultConfig(), 'a', 'roast')).toThrow(PersonaError);
    expect(() => upsertPersona(createDefaultConfig(), 'a', { nickname: 'x' })).toThrow(PersonaError);
  });

  it('数量上限：已有 max 个时新增拒绝、覆盖放行', () => {
    let cfg = createDefaultConfig();
    for (let i = 0; i < 20; i++) cfg = upsertPersona(cfg, `p${i}`, snap());
    expect(() => upsertPersona(cfg, 'new', snap())).toThrow(/limit reached/);
    const over = upsertPersona(cfg, 'p0', snap('default')); // 覆盖不受限
    expect(over.personas['p0'].style).toBe('default');
  });
});

describe('deletePersona', () => {
  it('存在则删除并报告 deleted:true；原配置不动', () => {
    const base = upsertPersona(createDefaultConfig(), 'a', snap());
    const { config, deleted } = deletePersona(base, 'a');
    expect(deleted).toBe(true);
    expect(config.personas['a']).toBeUndefined();
    expect(base.personas['a']).toBeDefined();
  });

  it('不存在返回 deleted:false 且配置原样', () => {
    const base = createDefaultConfig();
    const { config, deleted } = deletePersona(base, 'ghost');
    expect(deleted).toBe(false);
    expect(config).toBe(base);
  });
});

describe('personasPayload', () => {
  it('空配置：count 0、max 20', () => {
    const p = personasPayload(createDefaultConfig());
    expect(p).toEqual({ ok: true, count: 0, max: 20, personas: {} });
  });
});
