/**
 * validate 单测：长度 / 枚举 / 未知字段整单拒绝 / 默认值合法
 */
import { describe, it, expect } from 'vitest';
import { validateConfig } from '../src/config/validate';
import { createDefaultConfig } from '../src/config/schema';
import type { SoulConfigV2 } from '../src/config/schema';

function cfg(overrides: Partial<SoulConfigV2> = {}): Record<string, unknown> {
  return { ...createDefaultConfig(), ...overrides };
}

function errorsOf(r: ReturnType<typeof validateConfig>): string[] {
  return r.ok ? [] : r.errors.map((e) => e.path);
}

describe('validateConfig', () => {
  it('合法默认配置通过', () => {
    const r = validateConfig(createDefaultConfig());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.version).toBe(2);
      expect(r.value.style).toBe('default');
    }
  });

  it('部分字段 + 默认回填通过', () => {
    const r = validateConfig({ nickname: '小明', style: 'humorous' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nickname).toBe('小明');
      expect(r.value.style).toBe('humorous');
      expect(r.value.bio).toBe('');
      expect(r.value.memory.injectMaxChars).toBe(8000);
    }
  });

  it('长度校验：nickname>50 / bio>500 / customInstructions>2000 / 卡片>16KB 均拒绝', () => {
    expect(validateConfig(cfg({ nickname: 'x'.repeat(51) })).ok).toBe(false);
    expect(validateConfig(cfg({ bio: 'y'.repeat(501) })).ok).toBe(false);
    expect(validateConfig(cfg({ customInstructions: 'z'.repeat(2001) })).ok).toBe(false);
    const r = validateConfig(
      cfg({
        cards: [{ id: 'c1', name: 'k', content: 'a'.repeat(16 * 1024 + 1), updatedAt: '2026-01-01T00:00:00Z', source: 'user' }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(errorsOf(r)).toContain('cards[0].content');
  });

  it('长度边界：nickname=50 / bio=500 / 卡片=16KB 通过', () => {
    const r = validateConfig(
      cfg({
        nickname: 'x'.repeat(50),
        bio: 'y'.repeat(500),
        cards: [{ id: 'c1', name: 'k', content: 'a'.repeat(16 * 1024), updatedAt: '2026-01-01T00:00:00Z', source: 'user' }],
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('枚举校验：style 非法 / traits 非法 / language 非法 / evolution 非法 均拒绝', () => {
    expect(validateConfig(cfg({ style: 'angry' })).ok).toBe(false);
    expect(validateConfig(cfg({ traits: { headings: 'many', emoji: 'default' } })).ok).toBe(false);
    expect(validateConfig(cfg({ traits: { headings: 'default', emoji: 'lots' } })).ok).toBe(false);
    expect(validateConfig(cfg({ language: 'jp' })).ok).toBe(false);
    expect(validateConfig(cfg({ evolution: { ...createDefaultConfig().evolution, soulUpdateMode: 'prompt' } })).ok).toBe(false);
  });

  it('枚举边界：9 种 style 全部通过', () => {
    for (const style of ['default', 'professional', 'friendly', 'straight', 'whimsical', 'pragmatic', 'roast', 'coaching', 'humorous']) {
      const r = validateConfig(cfg({ style }));
      expect(r.ok, `style=${style}`).toBe(true);
    }
  });

  it('未知字段整单拒绝（rejectAll）且错误明细含字段级路径', () => {
    const r = validateConfig(cfg({ foo: 1, bar: 2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.rejectAll).toBe(true);
      expect(errorsOf(r)).toContain('foo');
      expect(errorsOf(r)).toContain('bar');
    }
  });

  it('嵌套未知字段同样整单拒绝', () => {
    const r = validateConfig(cfg({ memory: { inject: true, nonsense: 1 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.rejectAll).toBe(true);
      expect(errorsOf(r)).toContain('memory.nonsense');
    }
  });

  it('version 错误拒绝（v1 配置须先迁移）', () => {
    const r = validateConfig(cfg({ version: 1 as unknown as 2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(errorsOf(r)).toContain('version');
  });

  it('类型错误拒绝：nickname 为数字 / enabled 为字符串', () => {
    expect(validateConfig(cfg({ nickname: 123 as unknown as string })).ok).toBe(false);
    expect(validateConfig(cfg({ enabled: 'yes' as unknown as boolean })).ok).toBe(false);
  });

  it('非对象输入拒绝', () => {
    expect(validateConfig(null).ok).toBe(false);
    expect(validateConfig('str').ok).toBe(false);
    expect(validateConfig([1, 2]).ok).toBe(false);
  });
});
