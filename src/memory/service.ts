/**
 * 记忆文件读写与截断 —— service.ts
 *
 * 文件布局（$DSH_HOME/soul/memory/）：
 *   global.md        —— 无激活卡片时的全局记忆
 *   <card-slug>.md   —— 每张卡独立记忆文件（slug 由卡名/绑定名派生）
 *
 * 语义（沿用 dsh-soul-md）：
 *  - 记忆归属：激活卡片存在 → 读写卡片记忆文件；否则 → global.md；
 *  - 上限：memory.maxBytes（默认 1048576 = 1MB），超限**拒绝写入**；
 *  - 注入：取文件头（截断函数头截断，保持头部稳定、KV-cache 友好）。
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MEMORY_DEFAULTS } from '../config/schema';

export interface MemoryScope {
  /** 记忆域：'global' 或卡片绑定名（如卡名/slug） */
  scope: string;
}

/** 卡名 → 文件名 slug（小写、非字母数字连字符归一） */
export function slugify(name: string): string {
  const slug = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'card';
}

/**
 * 头截断：保留文件头、裁掉尾部，直至字符数 ≤ maxChars（Unicode code point 计数）。
 * 与 md 语义一致（"Cap for the injected section (from the file head)"）。
 */
export function truncateHead(text: string, maxChars: number): { text: string; chars: number; truncated: boolean } {
  if (maxChars <= 0) return { text: '', chars: 0, truncated: text.length > 0 };
  const chars = [...text];
  if (chars.length <= maxChars) return { text, chars: chars.length, truncated: false };
  const cut = chars.slice(0, maxChars).join('');
  return { text: cut, chars: maxChars, truncated: true };
}

export type MemoryWriteResult =
  | { ok: true; bytes: number; truncatedHint?: never }
  | { ok: false; reason: 'over-max-bytes'; bytes: number; maxBytes: number };

export class MemoryService {
  private readonly maxBytes: number;

  constructor(
    private readonly dir: string,
    maxBytes: number = MEMORY_DEFAULTS.maxBytes,
  ) {
    this.maxBytes = maxBytes;
  }

  /** global.md 或 <slug>.md */
  private fileFor(scope: string): string {
    const name = scope === 'global' || scope === '' ? 'global' : scope;
    return join(this.dir, `${slugify(name)}.md`);
  }

  /** 读取记忆文件；不存在返回 null */
  async read(scope: 'global' | string): Promise<string | null> {
    try {
      return await readFile(this.fileFor(scope), 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * 写入记忆文件。
   * 超限（maxBytes，按 UTF-8 字节计）→ 拒绝写入，返回 {ok:false, reason:'over-max-bytes'}。
   * 调用方如需落盘超长内容，应先 truncateHead 再由本方法写入。
   */
  async write(scope: 'global' | string, content: string): Promise<MemoryWriteResult> {
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > this.maxBytes) {
      return { ok: false, reason: 'over-max-bytes', bytes, maxBytes: this.maxBytes };
    }
    const file = this.fileFor(scope);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, 'utf8');
    return { ok: true, bytes };
  }

  /** 当前文件字节数（UTF-8）；不存在返回 0 */
  async size(scope: 'global' | string): Promise<number> {
    const content = await this.read(scope);
    return content === null ? 0 : Buffer.byteLength(content, 'utf8');
  }

  /** 删除记忆文件（如清理卡片时）；返回是否存在 */
  async remove(scope: 'global' | string): Promise<boolean> {
    const file = this.fileFor(scope);
    try {
      await rm(file, { force: false });
      return true;
    } catch {
      return false;
    }
  }

  /** 注入用：读取 + 头截断（injectMaxChars 来自 config.memory） */
  async readForInject(
    scope: 'global' | string,
    injectMaxChars: number = MEMORY_DEFAULTS.injectMaxChars,
  ): Promise<{ text: string; truncated: boolean; exists: boolean }> {
    const content = await this.read(scope);
    if (content === null) return { text: '', truncated: false, exists: false };
    const { text, truncated } = truncateHead(content, injectMaxChars);
    return { text, truncated, exists: true };
  }
}
