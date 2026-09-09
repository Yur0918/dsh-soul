/**
 * 审计日志（audit.ts）—— append-only JSONL
 *
 * 文件：$DSH_HOME/soul/audit/soul-audit.jsonl（每行一条 JSON）。
 * 设计（review_B §5.4）：
 *  - 只追加：状态流转以增量行（op:'status'）追加，不修改历史行；
 *  - readAll() 归并增量得到每条记录的最终 status；
 *  - 条目 schema：{id, ts, sessionId, actor, tool, target, oldHash, newText, status, source}；
 *  - status 枚举：pending | applied | rejected | superseded | expired（完备覆盖替换/过期路径）。
 */
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const AUDIT_STATUSES = ['pending', 'applied', 'rejected', 'superseded', 'expired'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const AUDIT_SOURCE_VALUES = ['conversation', 'ui', 'tool', 'evolution', 'md-import', 'status-change'] as const;
export type AuditSource = (typeof AUDIT_SOURCE_VALUES)[number] | string;

export interface AuditEntryInput {
  sessionId: string;
  actor: string;
  tool: string;
  target: string;
  oldHash?: string;
  newText?: string;
  status?: AuditStatus;
  source?: string;
}

export interface AuditEntry {
  id: string;
  ts: string;
  sessionId: string;
  actor: string;
  tool: string;
  target: string;
  oldHash: string;
  newText: string;
  status: AuditStatus;
  source: string;
}

/** 磁盘记录：put = 原始条目；status = 状态增量（append-only 的体现） */
interface DiskRecord {
  op: 'put' | 'status';
  id: string;
  ts: string;
  status: AuditStatus;
  sessionId?: string;
  actor?: string;
  tool?: string;
  target?: string;
  oldHash?: string;
  newText?: string;
  source?: string;
  reason?: string;
}

export function isAuditStatus(v: unknown): v is AuditStatus {
  return typeof v === 'string' && (AUDIT_STATUSES as readonly string[]).includes(v);
}

export class AuditLog {
  constructor(private readonly file: string) {}

  /** 追加一条审计条目（status 默认 pending） */
  async append(input: AuditEntryInput): Promise<AuditEntry> {
    await mkdir(dirname(this.file), { recursive: true });
    const entry: AuditEntry = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      sessionId: input.sessionId,
      actor: input.actor,
      tool: input.tool,
      target: input.target,
      oldHash: input.oldHash ?? '',
      newText: input.newText ?? '',
      status: input.status ?? 'pending',
      source: input.source ?? 'system',
    };
    const record: DiskRecord = { op: 'put', ...entry };
    await appendFile(this.file, JSON.stringify(record) + '\n', 'utf8');
    return entry;
  }

  /**
   * 状态流转（append-only 增量）：
   *  - 仅当目标条目存在且合法状态时追加 status 增量行；
   *  - 返回 false 表示条目不存在（或状态非法）。
   */
  async markStatus(id: string, status: AuditStatus, meta?: { sessionId?: string; actor?: string; reason?: string }): Promise<boolean> {
    if (!isAuditStatus(status)) return false;
    await mkdir(dirname(this.file), { recursive: true });
    const exists = (await this.readAll()).some((e) => e.id === id);
    if (!exists) return false;
    const record: DiskRecord = {
      op: 'status',
      id,
      ts: new Date().toISOString(),
      status,
      sessionId: meta?.sessionId ?? 'system',
      actor: meta?.actor ?? 'audit',
      source: 'status-change',
      reason: meta?.reason,
    };
    await appendFile(this.file, JSON.stringify(record) + '\n', 'utf8');
    return true;
  }

  /** 读取并归并全部条目（每条为最终 status） */
  async readAll(): Promise<AuditEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch {
      return [];
    }
    const puts = new Map<string, AuditEntry>();
    const order: string[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let rec: DiskRecord;
      try {
        rec = JSON.parse(line) as DiskRecord;
      } catch {
        continue; // 容忍损坏行
      }
      if (rec.op === 'put') {
        if (!puts.has(rec.id)) order.push(rec.id);
        puts.set(rec.id, {
          id: rec.id,
          ts: rec.ts,
          sessionId: rec.sessionId ?? '',
          actor: rec.actor ?? '',
          tool: rec.tool ?? '',
          target: rec.target ?? '',
          oldHash: rec.oldHash ?? '',
          newText: rec.newText ?? '',
          status: rec.status,
          source: rec.source ?? 'system',
        });
      } else if (rec.op === 'status') {
        const base = puts.get(rec.id);
        if (base) {
          base.status = rec.status;
          base.actor = rec.actor ?? base.actor;
          base.sessionId = rec.sessionId ?? base.sessionId;
        }
      }
    }
    return order.map((id) => puts.get(id) as AuditEntry);
  }

  /** 全部 pending 条目 */
  async pendings(): Promise<AuditEntry[]> {
    return (await this.readAll()).filter((e) => e.status === 'pending');
  }

  /** 按 tool 过滤 */
  async byTool(tool: string): Promise<AuditEntry[]> {
    return (await this.readAll()).filter((e) => e.tool === tool);
  }

  /** 审计文件字节数（不存在为 0） */
  async byteSize(): Promise<number> {
    try {
      const s = await stat(this.file);
      return s.size;
    } catch {
      return 0;
    }
  }
}
