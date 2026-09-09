/**
 * migrate 单测：v1→v2 style 映射（5 种 + 非法兜底 + humorous 保留）、
 * v1 traits 归一化、备份标记；md 导入映射、幂等、legacy path 兜底
 */
import { describe, it, expect } from 'vitest';
import { migrateV1ToV2, importFromMd, resolveV1Style, V1_STYLE_ALIAS } from '../src/config/migrate';
import { createDefaultConfig } from '../src/config/schema';
import type { SoulConfigV2 } from '../src/config/schema';

describe('resolveV1Style（别名表）', () => {
  it('5 种 v1 style 映射正确', () => {
    expect(resolveV1Style('professional').style).toBe('professional');
    expect(resolveV1Style('roast').style).toBe('roast');
    expect(resolveV1Style('efficient').style).toBe('pragmatic');
    expect(resolveV1Style('casual').style).toBe('friendly');
    expect(resolveV1Style('humorous').style).toBe('humorous');
  });

  it('humorous 保留为第 9 风格（review_B P0-1：不并入 whimsical）', () => {
    expect(V1_STYLE_ALIAS['humorous']).toBe('humorous');
    expect(resolveV1Style('humorous').mapped).toBe(false);
  });

  it('非法/未知值兜底 default', () => {
    expect(resolveV1Style('angry').style).toBe('default');
    expect(resolveV1Style('efficient-style').style).toBe('default');
    expect(resolveV1Style(undefined).style).toBe('default');
    expect(resolveV1Style(42).style).toBe('default');
    expect(resolveV1Style(null).style).toBe('default');
  });
});

describe('migrateV1ToV2', () => {
  it('v1 全字段迁移：enabled/nickname/bio/style/customInstructions/requireToolConfirmation 保留', () => {
    const v1 = {
      enabled: false,
      nickname: '老王',
      occupation: '安全工程师',
      bio: '喜欢写文档',
      style: 'efficient',
      language: 'en',
      customInstructions: '先给结论',
      requireToolConfirmation: true,
      personas: { 打工蛇: { nickname: '蛇', occupation: '翻译', bio: 'b', style: 'casual', language: 'zh', customInstructions: '' } },
    };
    const r = migrateV1ToV2(v1);
    expect(r.config.enabled).toBe(false);
    expect(r.config.nickname).toBe('老王');
    expect(r.config.occupation).toBe('安全工程师');
    expect(r.config.bio).toBe('喜欢写文档');
    expect(r.config.style).toBe('pragmatic');
    expect(r.config.language).toBe('en');
    expect(r.config.customInstructions).toBe('先给结论');
    expect(r.config.requireToolConfirmation).toBe(true);
    expect(r.config.version).toBe(2);
    expect(r.config.personas['打工蛇'].style).toBe('friendly');
    expect(r.warnings.join(' ')).toContain('efficient');
  });

  it('备份标记：meta.backup 保存原始值 + importedFrom=dsh-soul-v1', () => {
    const v1 = { nickname: '小李', style: 'casual' };
    const r = migrateV1ToV2(v1);
    expect(r.meta.from).toBe('v1');
    expect(r.meta.backup).toEqual(v1);
    expect(r.meta.styleMap).toEqual({ raw: 'casual', mapped: 'friendly', alias: true });
    expect(r.config.importedFrom).toBe('dsh-soul-v1');
  });

  it('traits 归一化：对象形态保留、非法值回退 default、平铺形态归一', () => {
    const obj = migrateV1ToV2({ traits: { headings: 'more', emoji: 'less' } });
    expect(obj.config.traits).toEqual({ headings: 'more', emoji: 'less' });

    const bad = migrateV1ToV2({ traits: { headings: 'many', emoji: 'lots' } });
    expect(bad.config.traits).toEqual({ headings: 'default', emoji: 'default' });

    const flat = migrateV1ToV2({ traitHeadings: 'more', traitEmoji: 'default' });
    expect(flat.config.traits).toEqual({ headings: 'more', emoji: 'default' });
    expect(flat.warnings.join(' ')).toContain('平铺');
  });

  it('casual→friendly 差异提示（warmth 增强）', () => {
    const r = migrateV1ToV2({ style: 'casual' });
    expect(r.warnings.join('\n')).toContain('亲和友善');
  });

  it('v1 缺失 style 时回退 default + 警告', () => {
    const r = migrateV1ToV2({ nickname: '无名' });
    expect(r.config.style).toBe('default');
    expect(r.warnings.join(' ')).toContain('style');
  });
});

describe('importFromMd（dsh-soul-md → v2 一次性导入）', () => {
  it('md 字段映射：cards/active/sessions/workspaces/memory.*', () => {
    const md = {
      cards: { '工程师小王': '# 我是工程师\n写代码要稳', '运营小张': '# 运营\n数据第一' },
      active: '工程师小王',
      sessions: { 'sess-1': '运营小张', 'sess-2': 'none' },
      workspaces: { '/ws/proj-a': '工程师小王' },
      workspaceList: [{ path: '/ws/proj-a', title: 'A' }],
      memory: { maxBytes: 2097152, inject: true, injectMaxChars: 5000, order: 0.4 },
    };
    const r = importFromMd(md);
    expect(r.skipped).toBe(false);
    expect(r.config.importedFrom).toBe('dsh-soul-md');
    expect(r.config.cards).toHaveLength(2);
    const card = r.config.cards.find((c) => c.name === '工程师小王');
    expect(card).toBeDefined();
    expect(card!.content).toContain('写代码要稳');
    expect(card!.source).toBe('import');
    expect(r.config.cardActive).toBe('工程师小王');
    expect(r.config.cardSessions).toEqual({ 'sess-1': '运营小张', 'sess-2': 'none' });
    expect(r.config.cardWorkspaces).toEqual({ '/ws/proj-a': '工程师小王' });
    expect(r.config.memory.maxBytes).toBe(2097152);
    expect(r.config.memory.injectMaxChars).toBe(5000);
    expect(r.config.memory.order).toBe(0.4);
    expect(r.meta?.importedCards).toBe(2);
  });

  it('md 数组形态 cards 兼容（{name,content} 对象数组）', () => {
    const r = importFromMd({ cards: [{ name: 'A', content: 'a' }, { name: 'B', content: 'b' }] });
    expect(r.config.cards).toHaveLength(2);
    expect(r.config.cards.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('幂等：importedFrom 已标记则跳过（二次运行无副作用）', () => {
    const current = createDefaultConfig();
    current.importedFrom = 'dsh-soul-md';
    const r = importFromMd({ cards: { 'X': 'content' } }, current);
    expect(r.skipped).toBe(true);
    expect(r.config).toBe(current);
    expect(r.config.cards).toHaveLength(0); // 未被二次导入
  });

  it('legacy path 兜底（md ≤v0.4 file-based）：path / cardPath / memory.path / legacyPath', () => {
    const r1 = importFromMd({ path: '/old/soul-md/cards' });
    expect(r1.config.importedFrom).toBe('dsh-soul-md@legacy');
    expect(r1.warnings.join(' ')).toContain('legacy');

    const r2 = importFromMd({ memory: { path: '/old/memory.md' } });
    expect(r2.config.importedFrom).toBe('dsh-soul-md@legacy');

    const r3 = importFromMd({ cardPath: '/x' });
    expect(r3.config.importedFrom).toBe('dsh-soul-md@legacy');

    const r4 = importFromMd({ legacyPath: '/y' });
    expect(r4.config.importedFrom).toBe('dsh-soul-md@legacy');
    expect(r4.meta?.legacy).toBe(true);
  });

  it('普通导入 + 已有 v2 配置：合并（保留 v2 卡片，追加 md 卡片）', () => {
    const current = createDefaultConfig();
    current.cards = [{ id: 'v2-1', name: '已有卡', content: '已有内容', updatedAt: '2026-01-01T00:00:00Z', source: 'user' }];
    const r = importFromMd({ cards: { '新卡': '新内容' } }, current);
    expect(r.skipped).toBe(false);
    expect(r.config.cards).toHaveLength(2);
    expect(r.config.cards[0].id).toBe('v2-1');
    expect(r.config.importedFrom).toBe('dsh-soul-md');
  });
});
