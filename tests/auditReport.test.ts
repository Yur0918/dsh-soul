/**
 * auditReport 测试（⑦ 组）：查询过滤 / 汇总 / 越轨启发式 / 组装
 */
import { describe, it, expect } from 'vitest';
import { filterAudit, summarizeAudit, detectDeviations, auditReport, DEVIATION_DEFAULTS } from '../src/memory/auditReport';
import type { AuditEntry } from '../src/memory/audit';

const e = (over: Partial<AuditEntry>): AuditEntry => ({
  id: over.id ?? 'id-' + Math.random().toString(36).slice(2),
  ts: over.ts ?? '2026-09-18T10:00:00.000Z',
  sessionId: over.sessionId ?? 's1',
  actor: over.actor ?? 'agent',
  tool: over.tool ?? 'set_persona',
  target: over.target ?? 'persona',
  oldHash: over.oldHash ?? '',
  newText: over.newText ?? '',
  status: over.status ?? 'applied',
  source: over.source ?? 'conversation',
});

describe('auditReport · 审计查询与越轨报告', () => {
  it('① filterAudit 按状态/工具/会话/时间窗过滤并按时间倒序', () => {
    const logs = [
      e({ ts: '2026-09-18T09:00:00.000Z', status: 'pending', tool: 'set_persona' }),
      e({ ts: '2026-09-18T10:00:00.000Z', status: 'applied', tool: 'memory_rewrite' }),
      e({ ts: '2026-09-18T11:00:00.000Z', status: 'pending', tool: 'set_persona', sessionId: 's2' }),
    ];
    expect(filterAudit(logs, { status: 'pending' }).map((x) => x.ts)).toEqual(['2026-09-18T11:00:00.000Z', '2026-09-18T09:00:00.000Z']);
    expect(filterAudit(logs, { tool: 'set_persona', sessionId: 's2' })).toHaveLength(1);
    expect(filterAudit(logs, { sinceTs: '2026-09-18T09:30:00.000Z', untilTs: '2026-09-18T10:30:00.000Z' })).toHaveLength(1);
    expect(filterAudit(logs, { limit: 1 })).toHaveLength(1);
  });

  it('② summarizeAudit 三维计数 + 时间边界 + 最老 pending', () => {
    const logs = [
      e({ ts: '2026-09-18T09:00:00.000Z', status: 'pending', tool: 'set_persona', target: 'persona' }),
      e({ ts: '2026-09-18T10:00:00.000Z', status: 'applied', tool: 'set_persona', target: 'persona' }),
      e({ ts: '2026-09-18T11:00:00.000Z', status: 'applied', tool: 'memory_rewrite', target: 'memory' }),
    ];
    const s = summarizeAudit(logs);
    expect(s.total).toBe(3);
    expect(s.byStatus).toEqual({ pending: 1, applied: 2 });
    expect(s.byTool).toEqual({ set_persona: 2, memory_rewrite: 1 });
    expect(s.byTarget).toEqual({ persona: 2, memory: 1 });
    expect(s.firstTs).toBe('2026-09-18T09:00:00.000Z');
    expect(s.lastTs).toBe('2026-09-18T11:00:00.000Z');
    expect(s.pendingOldestTs).toBe('2026-09-18T09:00:00.000Z');
  });

  it('③ detectDeviations 同会话同工具超阈值触发 tool-spam(高严重度阈值×2)', () => {
    const logs: AuditEntry[] = [];
    for (let i = 0; i < 13; i++) logs.push(e({ ts: `2026-09-18T10:${String(i).padStart(2, '0')}:00.000Z`, sessionId: 's1', tool: 'set_persona' }));
    const d = detectDeviations(logs, { maxToolCallsPerSession: 12 }, '2026-09-18T11:00:00.000Z');
    expect(d).toHaveLength(1);
    expect(d[0].kind).toBe('tool-spam');
    expect(d[0].severity).toBe('medium');
    const logs2: AuditEntry[] = [];
    for (let i = 0; i < 27; i++) logs2.push(e({ ts: `2026-09-18T10:${String(i).padStart(2, '0')}:00.000Z`, sessionId: 's1', tool: 'set_persona' }));
    const d2 = detectDeviations(logs2, { maxToolCallsPerSession: 12 }, '2026-09-18T11:00:00.000Z');
    expect(d2[0].severity).toBe('high');
  });

  it('④ detectDeviations pending 积压与停滞(阈值默认 8 条/24h)', () => {
    const logs: AuditEntry[] = [];
    for (let i = 0; i < 9; i++) logs.push(e({ ts: '2026-09-18T09:00:00.000Z', status: 'pending' }));
    const d = detectDeviations(logs, {}, '2026-09-18T10:00:00.000Z');
    expect(d.map((x) => x.kind)).toContain('pending-backlog');
    const d2 = detectDeviations([e({ ts: '2026-09-17T09:00:00.000Z', status: 'pending' })], {}, '2026-09-18T10:00:00.000Z');
    expect(d2.map((x) => x.kind)).toContain('pending-stale');
    expect(detectDeviations([e({ ts: '2026-09-18T09:30:00.000Z', status: 'pending' })], {}, '2026-09-18T10:00:00.000Z')).toHaveLength(0);
    expect(DEVIATION_DEFAULTS.maxPending).toBe(8);
  });

  it('⑤ auditReport 组装:matched/summary/deviations 一次返回', () => {
    const logs = [e({ ts: '2026-09-18T09:00:00.000Z', status: 'applied', tool: 'set_persona' })];
    const r = auditReport(logs, { tool: 'set_persona' }, {}, '2026-09-18T10:00:00.000Z');
    expect(r.matched).toHaveLength(1);
    expect(r.summary.total).toBe(1);
    expect(r.deviations).toHaveLength(0);
  });
});
