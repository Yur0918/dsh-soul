/**
 * compilePrompt 单测：全局注记 / 风格段示例与禁止 / 无风格串扰 /
 * 卡片加性层 / 记忆截断 / inject=false 不注入
 */
import { describe, it, expect } from 'vitest';
import { compilePrompt, GLOBAL_NOTE, resolveActiveCard } from '../src/prompt/compilePrompt';
import { createDefaultConfig } from '../src/config/schema';
import type { SoulConfigV2 } from '../src/config/schema';

function cfg(overrides: Partial<SoulConfigV2> = {}): SoulConfigV2 {
  const base = createDefaultConfig();
  const { memory, ...rest } = overrides;
  const merged = { ...base, ...rest };
  if (memory) merged.memory = { ...base.memory, ...memory };
  return merged;
}

describe('compilePrompt', () => {
  it('① 全局注记始终存在且包含优先级语义', () => {
    const out = compilePrompt({ config: cfg() });
    expect(out.persona).toContain(GLOBAL_NOTE);
    expect(out.persona).toContain('风格只约束表达方式与语气');
    expect(out.persona).toContain('以任务指令为准');
    expect(out.persona).toContain('不得干扰工具调用与结构化输出格式');
  });

  it('② 关于你包含 nickname/occupation/bio', () => {
    const out = compilePrompt({ config: cfg({ nickname: '小明', occupation: '运维工程师', bio: '十年老兵' }) });
    expect(out.persona).toContain('关于你');
    expect(out.persona).toContain('小明');
    expect(out.persona).toContain('运维工程师');
    expect(out.persona).toContain('十年老兵');
  });

  it('③ 风格段包含示例与禁止项', () => {
    const out = compilePrompt({ config: cfg({ style: 'humorous' }) });
    expect(out.persona).toContain('回复风格');
    expect(out.persona).toContain('示例：');
    expect(out.persona).toContain('这条报错闻起来像加班的味道');
    expect(out.persona).toContain('禁止项：');
    expect(out.persona).toContain('人身攻击');
  });

  it('④ 无风格串扰：humorous 与 roast 文案互不泄漏', () => {
    const humorous = compilePrompt({ config: cfg({ style: 'humorous' }) }).persona;
    const roast = compilePrompt({ config: cfg({ style: 'roast' }) }).persona;
    expect(humorous).toContain('笑点不伤信息量');
    expect(roast).toContain('吐槽');
    expect(humorous).not.toContain('吐槽'); // humorous 文案不引用 roast 专属措辞
    expect(roast).not.toContain('笑点不伤信息量');
  });

  it('④ 特质修饰注入（headings=more / emoji=less）', () => {
    const out = compilePrompt({ config: cfg({ traits: { headings: 'more', emoji: 'less' } }) });
    expect(out.persona).toContain('特质修饰');
    expect(out.persona).toContain('多级小标题');
    expect(out.persona).toContain('不使用 emoji');
  });

  it('⑤ 语言段：en 输出英文风格段与语言指令', () => {
    const out = compilePrompt({ config: cfg({ language: 'en', style: 'humorous' }) });
    expect(out.persona).toContain('Reply in English.');
    expect(out.persona).toContain('Witty & Humorous');
    expect(out.persona).toContain('punchlines must never cost information');
  });

  it('⑥ 自定义指令注入', () => {
    const out = compilePrompt({ config: cfg({ customInstructions: '所有回答都按番茄工作法组织' }) });
    expect(out.persona).toContain('自定义指令');
    expect(out.persona).toContain('番茄工作法');
  });

  it('⑦ 人设卡加性层：含标签与正文，且不替换设置字段（加性而非覆盖）', () => {
    const cards = [
      { id: 'c1', name: '程序媛小王', content: '我是后端开发，代码评审要求：先看测试再看实现。', updatedAt: new Date().toISOString(), source: 'user' as const },
      { id: 'c2', name: '运营小张', content: '我负责用户运营，偏好数据说话。', updatedAt: new Date().toISOString(), source: 'user' as const },
    ];
    const out = compilePrompt({ config: cfg({ nickname: '小张', cards }) });
    expect(out.persona).toContain('人设卡：程序媛小王');
    expect(out.persona).toContain('先看测试再看实现');
    expect(out.persona).toContain('人设卡：运营小张');
    // 加性层：设置字段仍在
    expect(out.persona).toContain('关于你');
    expect(out.persona).toContain('小张');
    expect(out.persona).toContain('回复风格');
  });

  it('⑦ resolveActiveCard：session > workspace > default 解析', () => {
    const config = cfg({ cardActive: 'c-default', cardSessions: { s1: 'c-session' }, cardWorkspaces: { '/ws/a': 'c-ws' } });
    expect(resolveActiveCard(config, 's1', '/ws/a')).toBe('c-session');
    expect(resolveActiveCard(config, 's-other', '/ws/a')).toBe('c-ws');
    expect(resolveActiveCard(config, 's-other', '/ws/other')).toBe('c-default');
    const noneCfg = cfg({ cardActive: 'c1', cardSessions: { s1: 'none' } });
    expect(resolveActiveCard(noneCfg, 's1')).toBeNull();
  });

  it('⑧ 记忆段头截断：injectMaxChars 生效', () => {
    const longMemory = 'x'.repeat(5000);
    const out = compilePrompt({
      config: cfg({ memory: { injectMaxChars: 100 } }),
      memoryText: longMemory,
    });
    expect(out.memory.startsWith('## 记忆')).toBe(true);
    const content = out.memory.slice('## 记忆\n'.length);
    expect([...content].length).toBeLessThanOrEqual(100);
    expect(content).not.toContain(longMemory); // 尾部已被截掉
  });

  it('⑧ inject=false 不注入记忆段', () => {
    const out = compilePrompt({
      config: cfg({ memory: { inject: false } }),
      memoryText: '很长的记忆内容'.repeat(100),
    });
    expect(out.memory).toBe('');
  });

  it('⑧ memoryText 为空时不注入', () => {
    const out = compilePrompt({ config: cfg() });
    expect(out.memory).toBe('');
  });

  it('输出为 {persona, memory} 两段', () => {
    const out = compilePrompt({ config: cfg(), memoryText: '记忆1' });
    expect(typeof out.persona).toBe('string');
    expect(typeof out.memory).toBe('string');
    expect(out.persona.length).toBeGreaterThan(0);
    expect(out.memory.length).toBeGreaterThan(0);
  });
});
