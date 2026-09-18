/**
 * auditReport.ts —— 审计查询与越轨报告（纯函数，无 IO）
 *
 * 承接评估报告介入建议 #1：echocat(62★/1d) 证明"审计可视化"是刚需出口。
 * soul 已有 append-only 审计骨架（audit.ts），本模块把 jsonl 变成可查询的：
 *  - summarizeAudit：状态/工具/目标三维汇总 + 时间窗口过滤；
 *  - detectDeviations：人设越轨启发式检测（工具面异常、高频 pending、失败链）。
 *
 * 设计纪律：纯函数、零 IO、零新依赖；所有阈值显式可配（含默认值）。
 */
import type { AuditEntry, AuditStatus } from './audit';

export interface AuditQuery {
  status?: AuditStatus;
  tool?: string;
  sessionId?: string;
  sinceTs?: string;
  untilTs?: string;
  limit?: number;
}

/** 按条件过滤审计条目（ts 为 ISO 字符串，字典序即时间序） */
export function filterAudit(entries: readonly AuditEntry[], q: AuditQuery): AuditEntry[] {
  let out = entries.slice();
  if (q.status !== undefined) out = out.filter((e) => e.status === q.status);
  if (q.tool !== undefined) out = out.filter((e) => e.tool === q.tool);
  if (q.sessionId !== undefined) out = out.filter((e) => e.sessionId === q.sessionId);
  if (q.sinceTs !== undefined) out = out.filter((e) => e.ts >= q.sinceTs!);
  if (q.untilTs !== undefined) out = out.filter((e) => e.ts <= q.untilTs!);
  out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)); // 新→旧
  if (q.limit !== undefined && q.limit >= 0) out = out.slice(0, q.limit);
  return out;
}

export interface AuditSummary {
  total: number;
  byStatus: Record<string, number>;
  byTool: Record<string, number>;
  byTarget: Record<string, number>;
  firstTs: string | null;
  lastTs: string | null;
  pendingOldestTs: string | null;
}

/** 三维汇总：状态/工具/目标计数 + 时间边界 + 最老 pending */
export function summarizeAudit(entries: readonly AuditEntry[]): AuditSummary {
  const byStatus: Record<string, number> = {};
  const byTool: Record<string, number> = {};
  const byTarget: Record<string, number> = {};
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let pendingOldestTs: string | null = null;
  for (const e of entries) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    byTool[e.tool] = (byTool[e.tool] ?? 0) + 1;
    byTarget[e.target] = (byTarget[e.target] ?? 0) + 1;
    if (firstTs === null || e.ts < firstTs) firstTs = e.ts;
    if (lastTs === null || e.ts > lastTs) lastTs = e.ts;
    if (e.status === 'pending' && (pendingOldestTs === null || e.ts < pendingOldestTs)) pendingOldestTs = e.ts;
  }
  return { total: entries.length, byStatus, byTool, byTarget, firstTs, lastTs, pendingOldestTs };
}

export interface DeviationRule {
  /** 单会话内同工具调用次数超过该值 → 工具面异常 */
  maxToolCallsPerSession?: number;
  /** pending 条目超过该值 → 积压告警 */
  maxPending?: number;
  /** pending 最老时长(分钟)超过该值 → 停滞告警(相对 nowTs) */
  maxPendingAgeMinutes?: number;
}

export const DEVIATION_DEFAULTS: Required<DeviationRule> = {
  maxToolCallsPerSession: 12,
  maxPending: 8,
  maxPendingAgeMinutes: 60 * 24,
};

export interface Deviation {
  kind: 'tool-spam' | 'pending-backlog' | 'pending-stale';
  severity: 'low' | 'medium' | 'high';
  detail: string;
  subject: string;
  count?: number;
}

/**
 * 越轨启发式：从审计流里找"不像该人设会有的行为"。
 * 显式声明为启发式（非人格判定）：只看审计条目的频次/积压/停滞三维。
 */
export function detectDeviations(entries: readonly AuditEntry[], rules: DeviationRule = {}, nowTs: string = new Date().toISOString()): Deviation[] {
  const R = { ...DEVIATION_DEFAULTS, ...rules };
  const out: Deviation[] = [];
  // 工具面异常：同 session+tool 调用频次
  const perSessionTool = new Map<string, number>();
  for (const e of entries) {
    const k = `${e.sessionId}\u241f${e.tool}`;
    perSessionTool.set(k, (perSessionTool.get(k) ?? 0) + 1);
  }
  for (const [k, count] of perSessionTool) {
    if (count > R.maxToolCallsPerSession) {
      const [sessionId, tool] = k.split('\u241f');
      out.push({ kind: 'tool-spam', severity: count > R.maxToolCallsPerSession * 2 ? 'high' : 'medium', detail: `会话 ${sessionId} 内工具 ${tool} 调用 ${count} 次(阈值 ${R.maxToolCallsPerSession})`, subject: tool, count });
    }
  }
  // pending 积压与停滞
  const pendings = entries.filter((e) => e.status === 'pending');
  if (pendings.length > R.maxPending) {
    out.push({ kind: 'pending-backlog', severity: pendings.length > R.maxPending * 2 ? 'high' : 'medium', detail: `pending 提案 ${pendings.length} 条(阈值 ${R.maxPending})`, subject: 'pending', count: pendings.length });
  }
  if (pendings.length > 0) {
    const oldest = pendings.reduce((m, e) => (e.ts < m ? e.ts : m), pendings[0].ts);
    const ageMin = (Date.parse(nowTs) - Date.parse(oldest)) / 60000;
    if (ageMin > R.maxPendingAgeMinutes) {
      out.push({ kind: 'pending-stale', severity: 'medium', detail: `最老 pending 已 ${Math.round(ageMin)} 分钟未处理(阈值 ${R.maxPendingAgeMinutes})`, subject: oldest });
    }
  }
  // 严重度排序
  const rank = { high: 0, medium: 1, low: 2 } as const;
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return out;
}

/** 一次性组装：查询 + 汇总 + 越轨（HTTP 层直接调用） */
export function auditReport(entries: readonly AuditEntry[], q: AuditQuery, rules: DeviationRule = {}, nowTs?: string): { matched: AuditEntry[]; summary: AuditSummary; deviations: Deviation[] } {
  const matched = filterAudit(entries, q);
  return { matched, summary: summarizeAudit(matched), deviations: detectDeviations(entries, rules, nowTs) };
}
