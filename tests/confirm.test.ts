/**
 * confirm 单测：三槽独立 / superseded / 过期 / 替换 / 状态流转移
 * （review_B P1-4：按 tool 分槽，防止跨工具无提示顶替）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLog } from '../src/memory/audit';
import { PendingRegistry, SLOT_TOOLS } from '../src/memory/confirm';

let dir: string;
let file: string;
let audit: AuditLog;
let reg: PendingRegistry;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'soul-confirm-'));
  file = join(dir, 'audit.jsonl');
  audit = new AuditLog(file);
  reg = new PendingRegistry(audit);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function enqueue(tool: Parameters<PendingRegistry['enqueue']>[0]['tool'], newText: string, sessionId = 's1', actor = 'agent') {
  return reg.enqueue({ tool, sessionId, actor, target: tool === 'memory_rewrite' ? 'global.md' : 'card-1', newText });
}

describe('PendingRegistry 按 tool 分槽', () => {
  it('三槽独立：三个工具同时各有一个 pending，互不顶替', async () => {
    await enqueue('set_persona', '新昵称：小明');
    await enqueue('soul_update', '把"偏好列表优先"写入卡');
    await enqueue('memory_rewrite', '重写记忆条目');
    const slots = await reg.pendingByTool();
    expect(slots.set_persona).not.toBeNull();
    expect(slots.soul_update).not.toBeNull();
    expect(slots.memory_rewrite).not.toBeNull();
    expect(new Set(SLOT_TOOLS.map((t) => slots[t]!.id)).size).toBe(3);
  });

  it('同槽顶替：同 tool 二次 enqueue → 旧提案 superseded，新提案 pending', async () => {
    const first = await enqueue('soul_update', 'v1');
    const second = await enqueue('soul_update', 'v2');
    expect(second.superseded?.id).toBe(first.entry.id);
    const all = await audit.readAll();
    expect(all.find((e) => e.id === first.entry.id)?.status).toBe('superseded');
    expect(all.find((e) => e.id === second.entry.id)?.status).toBe('pending');
  });

  it('不同槽互不影响：set_persona 的 pending 不会被 soul_update 顶替', async () => {
    const a = await enqueue('set_persona', '名字A');
    await enqueue('soul_update', '演化B');
    const slots = await reg.pendingByTool();
    expect(slots.set_persona?.id).toBe(a.entry.id);
    expect(slots.set_persona?.status).toBe('pending');
  });
});

describe('confirm / reject / replace / expire', () => {
  it('confirm：pending → applied', async () => {
    const { entry } = await enqueue('memory_rewrite', '新记忆');
    const r = await reg.confirm(entry.id);
    expect(r.ok).toBe(true);
    expect(r.entry?.status).toBe('applied');
  });

  it('reject：pending → rejected', async () => {
    const { entry } = await enqueue('memory_rewrite', '新记忆');
    const r = await reg.reject(entry.id);
    expect(r.ok).toBe(true);
    expect(r.entry?.status).toBe('rejected');
  });

  it('不可重复流转：applied 后 confirm/reject 均拒绝', async () => {
    const { entry } = await enqueue('soul_update', 'v1');
    await reg.confirm(entry.id);
    const again = await reg.reject(entry.id);
    expect(again.ok).toBe(false);
    expect(again.reason).toContain('not-pending');
  });

  it('replace：旧 → superseded，新文本入同槽 pending', async () => {
    const { entry } = await enqueue('soul_update', '旧文本');
    const r = await reg.replace(entry.id, '新文本');
    expect(r.ok).toBe(true);
    expect(r.superseded?.id).toBe(entry.id);
    expect(r.entry?.newText).toBe('新文本');
    const all = await audit.readAll();
    expect(all.find((e) => e.id === entry.id)?.status).toBe('superseded');
    expect(all.filter((e) => e.status === 'pending')).toHaveLength(1);
    expect(all.find((e) => e.status === 'pending')?.tool).toBe('soul_update');
  });

  it('expire：按 sessionId 过期指定会话 pending，其它会话保留', async () => {
    await enqueue('memory_rewrite', '会话1的记忆', 'session-A');
    await enqueue('soul_update', '会话2的演化', 'session-B');
    const expired = await reg.expire({ sessionId: 'session-A' });
    expect(expired).toBe(1);
    const slots = await reg.pendingByTool();
    expect(slots.memory_rewrite).toBeNull();
    expect(slots.soul_update?.sessionId).toBe('session-B');
    const all = await audit.readAll();
    expect(all.find((e) => e.sessionId === 'session-A')?.status).toBe('expired');
  });

  it('expire：olderThanMs 超时清理（旧 pending 过期，新 pending 保留）', async () => {
    // 直接构造一条 1 小时前的审计 put 行（append-only：手工写入即模拟历史条目）
    const oldTs = new Date(Date.now() - 3600_000).toISOString();
    await appendFile(
      file,
      JSON.stringify({
        op: 'put', id: 'old-1', ts: oldTs, sessionId: 'old-session', actor: 'agent',
        tool: 'soul_update', target: 'card-1', oldHash: '', newText: '旧提案',
        status: 'pending', source: 'conversation',
      }) + '\n',
      'utf8',
    );
    await enqueue('memory_rewrite', '新提案', 'new-session');
    const n = await reg.expire({ olderThanMs: 600_000 }); // 仅 1 小时前的过期
    expect(n).toBe(1);
    const all = await audit.readAll();
    expect(all.find((e) => e.id === 'old-1')?.status).toBe('expired');
    expect(all.find((e) => e.tool === 'memory_rewrite')?.status).toBe('pending');
  });

  it('expire 不传参：清理全部 pending（插件卸载/禁用兜底）', async () => {
    await enqueue('set_persona', 'A');
    await enqueue('soul_update', 'B');
    const n = await reg.expire();
    expect(n).toBe(2);
    expect(await reg.pending()).toHaveLength(0);
  });

  it('enqueue 默认 status=pending 且进入审计', async () => {
    const { entry } = await enqueue('set_persona', '名字');
    expect(entry.status).toBe('pending');
    expect(entry.source).toBe('conversation');
    const lines = await audit.readAll();
    expect(lines).toHaveLength(1);
  });
});
