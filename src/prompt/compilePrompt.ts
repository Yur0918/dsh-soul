/**
 * prompt 编译流水线（compilePrompt.ts）
 *
 * config → 纯文本（无宿主调用，可单测）。
 * 流水线（对应计划 §1.3，加性组合）：
 *   ① 全局注记（风格 ≤ 任务指令/准确性/安全；不得干扰工具调用与结构化输出）
 *   ② 关于你（nickname / occupation / bio）
 *   ③ 风格段（style.prompt + 示例 + 禁止项）
 *   ④ 特质修饰（traits.headings / traits.emoji）
 *   ⑤ 语言（zh / en）
 *   ⑥ 自定义指令（customInstructions）
 *   ⑦ 人设卡加性层（"人设卡：<name>" + content；卡片是补充层，不覆盖设置字段）
 *   ⑧ 记忆段（memory.inject=false 不注入；否则按 injectMaxChars 头截断）
 * 输出 { persona, memory } 两段，由 bridge 层按 SECTION_ORDER 注册/注入。
 */
import { getStyle, type StylePreset } from './styles';
import { truncateHead } from '../memory/service';
import type { SoulConfigV2, StyleId, Traits, Language } from '../config/schema';

/**
 * ①全局注记：所有风格共用，编译时固定拼在风格段之前。
 * 语义要点：风格只约束表达方式与语气，不改变任务要求、事实准确性与安全约束；
 * 与任务指令冲突以任务指令为准；不得干扰工具调用与结构化输出格式。
 */
export const GLOBAL_NOTE =
  '【全局注记】风格只约束表达方式与语气，不改变任务要求、事实准确性与安全约束；' +
  '与任务指令冲突时以任务指令为准；不得干扰工具调用与结构化输出格式。';

export interface CompilePromptInput {
  config: SoulConfigV2;
  /** 记忆文件原文（由调用方经 MemoryService.read 读取后传入；不传视为无记忆） */
  memoryText?: string;
}

export interface CompiledPrompt {
  /** soul:persona 段文本（全局注记 + 关于你 + 风格 + 特质 + 语言 + 自定义指令 + 人设卡加性层） */
  persona: string;
  /** soul:memory 段文本（inject=false 或 memoryText 为空时为 ''） */
  memory: string;
}

export function compilePrompt(input: CompilePromptInput): CompiledPrompt {
  const { config, memoryText = '' } = input;
  const style = getStyle(config.style);
  const lang = config.language;

  const parts: string[] = [];

  // ① 全局注记
  parts.push(GLOBAL_NOTE);

  // ② 关于你
  parts.push(aboutYou(config, lang));

  // ③ 风格段（含示例与禁止项）
  parts.push(styleSection(style, lang));

  // ④ 特质修饰
  parts.push(traitSection(config.traits, lang));

  // ⑤ 语言
  parts.push(languageSection(lang));

  // ⑥ 自定义指令
  if (config.customInstructions.trim()) {
    parts.push(lang === 'zh' ? `## 自定义指令\n${config.customInstructions}` : `## Custom Instructions\n${config.customInstructions}`);
  }

  // ⑦ 人设卡加性层：卡片为补充描述，不覆盖设置字段（相加不替换）
  const cardLayers = (config.cards ?? [])
    .filter((c) => c && typeof c.content === 'string' && c.content.trim() !== '')
    .map(
      (c) =>
        lang === 'zh'
          ? `## 人设卡：${c.name}\n${c.content}`
          : `## Persona Card: ${c.name}\n${c.content}`,
    );
  if (cardLayers.length > 0) {
    parts.push(cardLayers.join('\n\n'));
  }

  const persona = parts.filter((p) => p.trim() !== '').join('\n\n');

  // ⑧ 记忆段：inject=false 不注入；否则头截断至 injectMaxChars
  const memory = buildMemory(config, memoryText);

  return { persona, memory };
}

function aboutYou(config: SoulConfigV2, lang: Language): string {
  const zh = lang === 'zh';
  const lines: string[] = [zh ? '## 关于你' : '## About You'];
  if (config.nickname.trim()) lines.push(zh ? `你是「${config.nickname}」。` : `You are "${config.nickname}".`);
  if (config.occupation.trim()) lines.push(zh ? `职业/身份：${config.occupation}。` : `Occupation: ${config.occupation}.`);
  if (config.bio.trim()) lines.push(zh ? `简介：${config.bio}` : `Bio: ${config.bio}`);
  return lines.join('\n');
}

function styleSection(style: StylePreset, lang: Language): string {
  const zh = lang === 'zh';
  const lines: string[] = [zh ? `## 回复风格：${style.labelZh}` : `## Response Style: ${style.labelEn}`];
  lines.push(zh ? style.promptZh : style.promptEn);
  lines.push(zh ? `示例：${style.exampleZh}` : `Example: ${style.exampleEn}`);
  lines.push(zh ? `禁止项：${style.avoidZh}` : `Avoid: ${style.avoidEn}`);
  return lines.join('\n');
}

const HEADINGS_RULE: Record<Traits['headings'], { zh: string; en: string }> = {
  default: { zh: '按需使用标题与列表组织内容。', en: 'Use headings and lists as needed.' },
  more: { zh: '善用多级小标题与列表，结构化输出。', en: 'Prefer structured output with multi-level headings and lists.' },
  less: { zh: '尽量减少标题与列表，以段落衔接。', en: 'Minimize headings and lists; prefer flowing paragraphs.' },
};

const EMOJI_RULE: Record<Traits['emoji'], { zh: string; en: string }> = {
  default: { zh: '按需少量使用 emoji。', en: 'Use emoji sparingly when appropriate.' },
  more: { zh: '可适度使用 emoji 点缀。', en: 'Feel free to use emoji for light emphasis.' },
  less: { zh: '不使用 emoji。', en: 'Do not use emoji.' },
};

function traitSection(traits: Traits, lang: Language): string {
  const zh = lang === 'zh';
  const lines: string[] = [zh ? '## 特质修饰' : '## Trait Tuning'];
  lines.push(zh ? `- 标题：${HEADINGS_RULE[traits.headings].zh}` : `- Headings: ${HEADINGS_RULE[traits.headings].en}`);
  lines.push(zh ? `- 表情符号：${EMOJI_RULE[traits.emoji].zh}` : `- Emoji: ${EMOJI_RULE[traits.emoji].en}`);
  return lines.join('\n');
}

function languageSection(lang: Language): string {
  return lang === 'zh' ? '## 输出语言\n请使用简体中文回复。' : '## Output Language\nReply in English.';
}

function buildMemory(config: SoulConfigV2, memoryText: string): string {
  if (!config.memory.inject) return '';
  if (!memoryText || memoryText.trim() === '') return '';
  const { text } = truncateHead(memoryText, config.memory.injectMaxChars);
  const zh = config.language === 'zh';
  // 注记：不可变前缀保证头截断后仍以稳定标记开头（KV-cache 友好）
  return `${zh ? '## 记忆' : '## Memory'}\n${text}`;
}

/** 便捷：当前生效卡片 id（session > workspace > default 解析逻辑的纯函数部分） */
export function resolveActiveCard(config: SoulConfigV2, sessionId?: string, workspacePath?: string): string | null {
  if (sessionId && config.cardSessions[sessionId] !== undefined) {
    const v = config.cardSessions[sessionId];
    return v === 'none' || v === '' ? null : v;
  }
  if (workspacePath && config.cardWorkspaces[workspacePath] !== undefined) {
    const v = config.cardWorkspaces[workspacePath];
    return v === 'none' || v === '' ? null : v;
  }
  return config.cardActive && config.cardActive !== '' ? config.cardActive : null;
}
