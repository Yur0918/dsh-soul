/**
 * 确认槽（confirm.ts）—— pending 提案按 tool 分槽管理
 *
 * review_B P1-4 定稿：**按 tool 分槽**（set_persona / soul_update / memory_rewrite 各一槽），
 * 避免"set_persona 未确认 → soul_update 发起 → 前者被无提示淘汰"的跨工具顶替。
 *
 * 行为：
 *  - enqueue：同槽已有 pending → 旧提案被标记 superseded（审计可溯源），新提案入槽为 pending；
 *  - confirm / reject：仅 pending 可流转（applied / rejected）；
 *  - replace：旧提案 → superseded，新内容生成新 pending 条目入同槽；
 *  - expire：按 sessionId 或超时（olderThanMs）批量过期未处理提案（会话级清理兜底）。
 */
import type { AuditEntry, AuditLog } from './audit';
import type { AuditStatus } from './audit';

/** 独立槽的工具 */
export const SLOT_TOOLS = ['set_persona', 'soul_update', 'memory_rewrite'] as const;
export type SlotTool = (typeof SLOT_TOOLS)[number];

export function isSlotTool(v: string): v is SlotTool {
  return (SLOT_TOOLS as readonly string[]).includes(v);
}

export interface PendingEnqueueInput {
  tool: SlotTool;
  sessionId: string;
  actor: string;
  target: string;
  newText: string;
  oldHash?: string;
  source?: string;
}

export interface PendingTransitionResult {
  ok: boolean;
  entry?: AuditEntry;
  reason?: string;
}

export class PendingRegistry {
  constructor(private readonly audit: AuditLog) {}

  /** 入槽：同槽已占用 → 旧提案 superseded，新提案 pending */
  async enqueue(input: PendingEnqueueInput): Promise<{ entry: AuditEntry; superseded?: AuditEntry }> {
    const existing = (await this.audit.pendings())
      .filter((e) => e.tool === input.tool)
      .sort((a, b) => (a.ts < b.ts ? -1 : 1));
    let superseded: AuditEntry | undefined;
    if (existing.length > 0) {
      const top = existing[existing.length - 1];
      await this.audit.markStatus(top.id, 'superseded', {
        sessionId: input.sessionId,
        actor: input.actor,
        reason: 'slot-replaced-by-new-pending',
      });
      superseded = top;
    }
    const entry = await this.audit.append({
      sessionId: input.sessionId,
      actor: input.actor,
      tool: input.tool,
      target: input.target,
      newText: input.newText,
      oldHash: input.oldHash ?? '',
      status: 'pending',
      source: input.source ?? 'conversation',
    });
    return { entry, superseded };
  }

  /** 确认：pending → applied */
  async confirm(id: string): Promise<PendingTransitionResult> {
    return this.transition(id, 'applied');
  }

  /** 拒绝：pending → rejected */
  async reject(id: string): Promise<PendingTransitionResult> {
    return this.transition(id, 'rejected');
  }

  /**
   * 替换：pending → superseded（旧），并以新文本入同槽新 pending。
   * 返回 superseded（旧条目）与新 entry。
   */
  async replace(
    id: string,
    newText: string,
    meta?: { sessionId?: string; actor?: string },
  ): Promise<{ ok: boolean; superseded?: AuditEntry; entry?: AuditEntry; reason?: string }> {
    const all = await this.audit.readAll();
    const old = all.find((e) => e.id === id);
    if (!old) return { ok: false, reason: 'entry-not-found' };
    if (old.status !== 'pending') return { ok: false, reason: `not-pending (status=${old.status})` };
    if (!isSlotTool(old.tool)) return { ok: false, reason: `tool-not-slot (${old.tool})` };
    await this.audit.markStatus(id, 'superseded', {
      sessionId: meta?.sessionId ?? old.sessionId,
      actor: meta?.actor ?? old.actor,
      reason: 'replaced-by-user',
    });
    const entry = await this.audit.append({
      sessionId: meta?.sessionId ?? old.sessionId,
      actor: meta?.actor ?? old.actor,
      tool: old.tool,
      target: old.target,
      newText,
      oldHash: old.newText,
      status: 'pending',
      source: old.source,
    });
    return { ok: true, superseded: old, entry };
  }

  /**
   * 过期：将 pending 提案标记 expired。
   * - 传入 {sessionId}：仅该会话的 pending；
   * - 传入 {olderThanMs}：所有 ts 早于 now-olderThanMs 的 pending；
   * - 不传：全部 pending（如插件卸载/配置禁用时）。
   * 返回过期数量。
   */
  async expire(opts: { sessionId?: string; olderThanMs?: number } = {}): Promise<number> {
    const pendings = await this.audit.pendings();
    const now = Date.now();
    let count = 0;
    for (const e of pendings) {
      if (opts.sessionId !== undefined && e.sessionId !== opts.sessionId) continue;
      if (opts.olderThanMs !== undefined && now - Date.parse(e.ts) < opts.olderThanMs) continue;
      await this.audit.markStatus(e.id, 'expired', {
        sessionId: e.sessionId,
        actor: 'registry',
        reason: opts.sessionId !== undefined ? 'session-ended' : 'timeout-or-cleanup',
      });
      count++;
    }
    return count;
  }

  /** 各槽当前 pending（槽独立：互不顶替） */
  async pendingByTool(): Promise<Record<SlotTool, AuditEntry | null>> {
    const slots: Record<SlotTool, AuditEntry | null> = { set_persona: null, soul_update: null, memory_rewrite: null };
    for (const e of await this.audit.pendings()) {
      if (isSlotTool(e.tool)) slots[e.tool] = e;
    }
    return slots;
  }

  /** 全部 pending（按 ts 升序） */
  async pending(): Promise<AuditEntry[]> {
    const pendings = await this.audit.pendings();
    return pendings.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  }

  private async transition(id: string, status: Extract<AuditStatus, 'applied' | 'rejected'>): Promise<PendingTransitionResult> {
    const all = await this.audit.readAll();
    const entry = all.find((e) => e.id === id);
    if (!entry) return { ok: false, reason: 'entry-not-found' };
    if (entry.status !== 'pending') return { ok: false, reason: `not-pending (status=${entry.status})` };
    await this.audit.markStatus(id, status, { sessionId: entry.sessionId, actor: 'user' });
    const updated = (await this.audit.readAll()).find((e) => e.id === id);
    return { ok: true, entry: updated };
  }
}
