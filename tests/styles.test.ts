/**
 * styles.ts 单测：9 风格 zh/en 快照字段完备性 + humorous 定稿验证
 */
import { describe, it, expect } from 'vitest';
import { STYLES, getStyle } from '../src/prompt/styles';
import { STYLE_IDS } from '../src/config/schema';

const REQUIRED_FIELDS = ['id', 'labelZh', 'labelEn', 'promptZh', 'promptEn', 'exampleZh', 'exampleEn', 'avoidZh', 'avoidEn'] as const;

describe('styles', () => {
  it('恰好 9 种风格，id 与 STYLE_IDS 一一对应', () => {
    expect(STYLES).toHaveLength(9);
    expect(STYLES.map((s) => s.id)).toEqual([...STYLE_IDS]);
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(9);
  });

  it('每种风格 zh/en 文案字段完备且非空（快照字段校验）', () => {
    for (const s of STYLES) {
      for (const f of REQUIRED_FIELDS) {
        const v = (s as unknown as Record<string, unknown>)[f];
        expect(v, `${s.id}.${f} 必须存在且非空`).toBeTruthy();
        expect(String(v).trim().length, `${s.id}.${f} 不能是空白`).toBeGreaterThan(0);
      }
    }
  });

  it('humorous 为第 9 风格，文案按 review_B 定稿（含示例与收敛条款）', () => {
    const h = getStyle('humorous');
    expect(h.labelZh).toBe('幽默风趣');
    expect(h.labelEn).toBe('Witty & Humorous');
    expect(h.promptZh).toContain('笑点不伤信息量');
    expect(h.promptZh).toContain('严肃话题');
    expect(h.promptZh).toContain('收敛');
    expect(h.exampleZh).toContain('这条报错闻起来像加班的味道');
    expect(h.avoidZh).toContain('人身攻击');
    expect(h.avoidZh).toContain('连续玩梗');
    expect(h.avoidZh).toContain('无信息量');
  });

  it('其余 8 种风格关键词抽查（已定稿文案）', () => {
    expect(getStyle('default').labelZh).toContain('默认');
    expect(getStyle('professional').promptZh).toContain('结论先行');
    expect(getStyle('friendly').promptZh).toContain('温暖');
    expect(getStyle('straight').promptZh).toContain('不针对人');
    expect(getStyle('whimsical').promptZh).toContain('比喻');
    expect(getStyle('pragmatic').promptZh).toContain('优先级');
    expect(getStyle('roast').promptZh).toContain('严肃');
    expect(getStyle('coaching').promptZh).toContain('提问');
  });

  it('未知风格抛错', () => {
    expect(() => getStyle('angry')).toThrow(/未知风格/);
  });
});
