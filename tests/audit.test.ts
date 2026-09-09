/**
 * audit 单测：append-only / 状态流转 / 过滤 / 非法状态拒绝 / 损坏行容忍
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLog, AUDIT_STATUSES } from '../src/memory/audit';

let dir: string;
let file: string;
let audit: AuditLog;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'soul-audit-'));
  file = join(dir, 'audit.jsonl');
  audit = new AuditLog(file);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function entryInput(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 's1',
    actor: 'agent',
    tool: 'memory_rewrite',
    target: 'global.md',
    oldHash: 'abc123',
    newText: '某条记忆',
    source: 'conversation',
    ...overrides,
  };
}

describe('AuditLog', () => {
  it('append：追加条目字段完备，status 默认 pending', async () => {
    const e = await audit.append(entryInput());
    expect(e.id).toBeTruthy();
    expect(e.ts).toBeTruthy();
    expect(e.status).toBe('pending');
    expect(e.sessionId).toBe('s1');
    expect(e.actor).toBe('agent');
    expect(e.tool).toBe('memory_rewrite');
    expect(e.target).toBe('global.md');
    expect(e.oldHash).toBe('abc123');
    expect(e.newText).toBe('某条记忆');
    expect(e.source).toBe('conversation');
    const all = await audit.readAll();
    expect(all).toHaveLength(1);
    // append-only：文件为单行 JSON
    const raw = (await readFile(file, 'utf8')).trim().split('\n');
    expect(raw).toHaveLength(1);
    expect(JSON.parse(raw[0]).op).toBe('put');
  });

  it('append-only：status 流转以增量行追加，历史行不改写', async () => {
    const e = await audit.append(entryInput());
    const ok = await audit.markStatus(e.id, 'applied', { sessionId: 's1', actor: 'user' });
    expect(ok).toBe(true);
    const raw = (await readFile(file, 'utf8')).trim().split('\n');
    expect(raw).toHaveLength(2); // 1 put + 1 status 增量
    expect(raw[0]).not.toContain('"applied"'); // 历史行未被改写
    const all = await audit.readAll();
    expect(all).toHaveLength(1); // 归并后仍是一条记录
    expect(all[0].status).toBe('applied');
  });

  it('markStatus：条目不存在返回 false', async () => {
    const ok = await audit.markStatus('no-such-id', 'applied');
    expect(ok).toBe(false);
  });

  it('status 枚举完备：pending/applied/rejected/superseded/expired', async () => {
    expect([...AUDIT_STATUSES]).toEqual(['pending', 'applied', 'rejected', 'superseded', 'expired']);
    const e = await audit.append(entryInput());
    expect(await audit.markStatus(e.id, 'superseded')).toBe(true);
    expect((await audit.readAll())[0].status).toBe('superseded');
  });

  it('status 流转链：pending → superseded → （无旁路）', async () => {
    const e = await audit.append(entryInput());
    expect(await audit.markStatus(e.id, 'superseded')).toBe(true);
    expect(await audit.markStatus(e.id, 'expired')).toBe(true);
    const all = await audit.readAll();
    expect(all[0].status).toBe('expired'); // 最新增量生效
  });

  it('pendings / byTool 过滤', async () => {
    await audit.append(entryInput({ tool: 'memory_rewrite', target: 'global.md' }));
    await audit.append(entryInput({ tool: 'soul_update', target: 'card-1' }));
    await audit.append(entryInput({ tool: 'memory_rewrite', target: 'global.md', status: 'applied' }));
    const pendings = await audit.pendings();
    expect(pendings).toHaveLength(2);
    const rewrites = await audit.byTool('memory_rewrite');
    expect(rewrites).toHaveLength(2);
  });

  it('byteSize：不存在为 0，追加后 >0', async () => {
    expect(await audit.byteSize()).toBe(0);
    await audit.append(entryInput());
    expect(await audit.byteSize()).toBeGreaterThan(0);
  });

  it('损坏行容忍：非法 JSON 行被跳过，不抛错', async () => {
    await writeFile(file, '{not-json}\n', 'utf8');
    await audit.append(entryInput());
    const all = await audit.readAll();
    expect(all).toHaveLength(1);
  });

  it('并发 append 不丢行（顺序追加）', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      audit.append(entryInput({ tool: `tool-${i}` })),
    );
    await Promise.all(tasks);
    expect((await audit.readAll())).toHaveLength(10);
    const raw = (await readFile(file, 'utf8')).trim().split('\n');
    expect(raw).toHaveLength(10);
  });
});
