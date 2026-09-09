/**
 * dsh-soul v2 (SoulFusion) — MV1 plugin assembly.
 *
 * Host-side wiring:
 *  - config persistence: $DSH_HOME/soul/soul-config.json (atomic write, v1
 *    backup, idempotent import markers)
 *  - prompt sections: soul:persona (0.1) + soul:memory (0.5) registered as
 *    lazy getters so config changes apply on the next assembly — no agent
 *    restart, no inject needed
 *  - /soul command family via ctx.commands.register
 *  - set_persona agent tool via the harness tool registry (globally
 *    available at runtime; absent in headless spines → warn only)
 *  - HTTP API: GET/POST /dsh-soul/config for the settings page
 *
 * Everything degrades warn-only: a missing service disables its feature but
 * never crashes the plugin tree.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createDefaultConfig, isV2Config, SCHEMA_VERSION, LIMITS } from './config/schema';
import { validateConfig } from './config/validate';
import { migrateV1ToV2, importFromMd, isImported } from './config/migrate';
import { compilePrompt, GLOBAL_NOTE } from './prompt/compilePrompt';
import { SECTION_ORDER } from './prompt/sections';
import { StyleId, SoulConfigV2, STYLE_IDS, LANGUAGE_IDS } from './config/schema';

const PLUGIN_ID = 'soul';

type Level = 'info' | 'warn' | 'error';

interface SoulCtx {
  get<T = unknown>(name: string): T | undefined;
  logger?: { info?(m: string): void; warn?(m: string): void; error?(m: string): void };
  on?(event: string, cb: () => void): () => void;
  [key: string]: unknown;
}

interface CommandDefinition {
  name: string;
  description?: string;
  hint?: string;
  handler(input: { args?: string[]; prefix?: string }): { ok: boolean; message?: string; text?: string } | Promise<{ ok: boolean; message?: string; text?: string }>;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function soulDir(ctx: SoulCtx): string {
  // DSH_HOME when the host sets it (headless/CLI profiles); otherwise the
  // conventional ~/.dsh data dir used by the web profile.
  const home = process.env.DSH_HOME ?? join(process.env.HOME ?? '/tmp', '.dsh');
  return join(home, 'soul');
}

function configPath(ctx: SoulCtx): string {
  return join(soulDir(ctx), 'soul-config.json');
}

function loadConfig(ctx: SoulCtx): SoulConfigV2 {
  const path = configPath(ctx);
  try {
    if (existsSync(path)) {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      if (isV2Config(raw)) {
        const v = validateConfig(raw as SoulConfigV2);
        if (v.ok) return v.value;
      }
      // v1 file: one-shot migration on read (keeps the file untouched).
      const v1 = migrateV1ToV2(raw as Record<string, unknown>);
      return v1.config;
    }
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-soul] config load failed: ${String(error)}; using defaults`);
  }
  return { ...createDefaultConfig() };
}

function saveConfig(ctx: SoulCtx, config: SoulConfigV2, acceptV1 = false): { ok: boolean; errors?: string[] } {
  const validation = validateConfig(config);
  if (!validation.ok) return { ok: false, errors: validation.errors.map(e => `${e.path}: ${e.message}`) };
  try {
    const dir = soulDir(ctx);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const path = configPath(ctx);
    if (existsSync(path)) renameSync(path, `${path}.v1.bak.json`.replace('.v1.bak.json', '.bak.json'));
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(validation.value, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, path);
    return { ok: true };
  } catch (error) {
    ctx.logger?.error?.(`[dsh-soul] config save failed: ${String(error)}`);
    return { ok: false, errors: [`save failed: ${String(error)}`] };
  }
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

interface SoulState {
  config: SoulConfigV2;
  refresh: () => void;
}

export function apply(ctx: SoulCtx): { dispose(): void } {
  const log = (level: Level, msg: string): void => {
    const line = `[dsh-soul] ${msg}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    try { ctx.logger?.[level]?.(line); } catch { /* logger optional */ }
  };

  const state: SoulState = { config: loadConfig(ctx), refresh: () => {} };
  const runningTools: Array<() => void> = [];

  // Lazy prompt section text: read the CURRENT config at assembly time, so a
  // config save is effective on the very next model step with no inject.
  const personaText = (): string => compilePrompt({ config: state.config }).persona;
  const memoryText = (): string => compilePrompt({ config: state.config }).memory;

  try {
    const injectFn = (ctx as unknown as { inject?: (services: string[], cb: (hostCtx: Record<string, unknown>) => void) => void }).inject;
    const registerSections = (hostCtx: Record<string, unknown>): void => {
      const sp = hostCtx.systemPrompt as { section?(spec: { name: string; order: number; text: string | (() => string) }): unknown } | undefined
        ?? (hostCtx as Record<string, unknown>).dshSystemPrompt as { section?: unknown } | undefined;
      if (sp !== undefined && typeof (sp as { section?: unknown }).section === 'function') {
        (sp as { section(spec: unknown): unknown }).section({ name: 'soul:persona', order: SECTION_ORDER.persona, text: personaText });
        const mem = memoryText();
        if (mem !== '') (sp as { section(spec: unknown): unknown }).section({ name: 'soul:memory', order: SECTION_ORDER.memory, text: memoryText });
        log('info', `prompt sections registered (persona@${SECTION_ORDER.persona}, memory@${SECTION_ORDER.memory})`);
      } else {
        log('warn', 'systemPrompt service not found — persona injection disabled');
      }
    };
    if (typeof injectFn === 'function') injectFn(['systemPrompt'], registerSections);
    else log('warn', 'ctx.inject unavailable — service access disabled');
  } catch (error) {
    log('error', `section registration failed: ${String(error)}`);
  }

  // ---- HTTP API: GET/POST /dsh-soul/config --------------------------------
  try {
    const injectFn = (ctx as unknown as { inject?: (services: string[], cb: (hostCtx: Record<string, unknown>) => void) => void }).inject;
    if (typeof injectFn === 'function') injectFn(['webServer'], (hostCtx: Record<string, unknown>) => {
    const webServer = hostCtx.webServer as { register(opts: { kind: string; path: string; handler: (req: unknown, res: unknown) => void }): unknown } | undefined;
    if (webServer !== undefined && typeof webServer.register === 'function') {
      webServer.register({
        kind: 'exact',
        path: '/dsh-soul/config',
        handler: (req: unknown, res: unknown) => {
          const r = res as { writeHead?: (code: number, headers?: Record<string, string>) => void; end?: (body: string) => void };
          const write = (code: number, body: string): void => {
            r.writeHead?.(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
            r.end?.(body);
          };
          const method = String((req as { method?: string })?.method ?? 'GET').toUpperCase();
          if (method === 'GET') {
            write(200, JSON.stringify({ ok: true, config: state.config }));
            return;
          }
          if (method === 'POST') {
            // Minimal async body read parity with the host's readJsonBody.
            let body = '';
            const onData = (chunk: Buffer | string): void => { body += String(chunk); };
            const onEnd = (): void => {
              process.removeListener?.('soul-http-data', onData);
              try {
                const parsed = JSON.parse(body) as Partial<SoulConfigV2>;
                const next = { ...state.config, ...parsed } as SoulConfigV2;
                const saved = saveConfig(ctx, next, true);
                if (!saved.ok) {
                  write(400, JSON.stringify({ ok: false, errors: saved.errors ?? [] }));
                  return;
                }
                state.config = next;
                log('info', `config saved via HTTP (style=${String(next.style)})`);
                write(200, JSON.stringify({ ok: true, config: state.config }));
              } catch (error) {
                write(400, JSON.stringify({ ok: false, errors: [`parse failed: ${String(error)}`] }));
              }
            };
            // The host request is async-iterable; read it like readJsonBody.
            const iterable = req as unknown as AsyncIterable<Buffer | string>;
            void (async () => {
              try {
                for await (const chunk of iterable) onData(chunk);
                onEnd();
              } catch {
                write(400, JSON.stringify({ ok: false, errors: ['body read failed'] }));
              }
            })();
            return;
          }
          write(405, JSON.stringify({ ok: false, errors: ['method not allowed'] }));
        },
      });
      log('info', `HTTP API mounted: /dsh-soul/config`);
    } else {
      log('warn', 'webServer not available — settings API disabled');
    }
    });
  } catch (error) {
    log('error', `webServer registration failed: ${String(error)}`);
  }

  // ---- /soul command family ------------------------------------------------
  const commandExports: CommandDefinition[] = [
    {
      name: 'soul',
      description: '查看或修改 dsh-soul 个性化配置（show/set/reset/enable/disable）',
      hint: '动作与参数，如 show | set style=roast | 昵称',
      handler: async ({ args }) => {
        const a = args ?? [];
        const action = a[0] ?? 'show';
        if (action === 'show') {
          const c = state.config;
          return {
            ok: true,
            text: `dsh-soul v2 配置：\n- enabled: ${String(c.enabled)}\n- 昵称: ${c.nickname || '—'}\n- 风格: ${String(c.style)}\n- 语言: ${c.language}\n- 自定义指令: ${c.customInstructions.slice(0, 60) || '—'}\n- 人设卡: ${Object.keys(c.cards).length} 张\n- 记忆注入: ${String(c.memory.inject)}（上限 ${c.memory.injectMaxChars} 字符）`,
          };
        }
        if (action === 'set') {
          const kv = a.slice(1).join(' ').split(/[=:]/);
          const key = (kv[0] ?? '').trim();
          const value = (kv.slice(1).join('=') ?? '').trim();
          if (key === '' || value === '') return { ok: false, message: '用法：/soul set <key>=<value>；支持 key: style/language/nickname/occupation/bio/customInstructions/enabled' };
          const next: SoulConfigV2 = { ...state.config };
          const loose: Record<string, unknown> = next as unknown as Record<string, unknown>;
          if (key === 'style' || key === 'language' || key === 'nickname' || key === 'occupation' || key === 'bio' || key === 'customInstructions') {
            if (key === 'style' && !STYLE_IDS.includes(value as StyleId)) return { ok: false, message: `未知风格 ${value}；可选: ${STYLE_IDS.join('/')}` };
            if (key === 'language' && !LANGUAGE_IDS.includes(value as 'zh' | 'en')) return { ok: false, message: `未知语言 ${value}；可选: ${LANGUAGE_IDS.join('/')}` };
            loose[key] = value;
          } else if (key === 'enabled') {
            next.enabled = value === 'true';
          } else {
            return { ok: false, message: `未知字段 ${key}；支持: style/language/nickname/occupation/bio/customInstructions/enabled` };
          }
          const saved = saveConfig(ctx, next, true);
          if (!saved.ok) return { ok: false, message: `保存失败: ${(saved.errors ?? []).join('; ')}` };
          state.config = next as SoulConfigV2;
          return { ok: true, text: `已更新 ${key}=${String(value)}；下次回复生效。` };
        }
        if (action === 'reset') {
          state.config = { ...createDefaultConfig() };
          saveConfig(ctx, state.config, true);
          return { ok: true, text: '配置已重置为默认（人设卡/预设保留在文件里）。' };
        }
        if (action === 'enable') {
          state.config.enabled = true;
          saveConfig(ctx, state.config, true);
          return { ok: true, text: '个性化设置已启用。' };
        }
        if (action === 'disable') {
          state.config.enabled = false;
          saveConfig(ctx, state.config, true);
          return { ok: true, text: '个性化设置已停用。' };
        }
        // 昵称快捷方式：/soul 小明
        const name = a.join(' ');
        if (name.startsWith('soul ')) {
          const nick = name.slice(5).trim();
          if (nick.length > 0 && nick.length <= LIMITS.nickname) {
            state.config.nickname = nick;
            saveConfig(ctx, state.config, true);
            return { ok: true, text: `昵称已设置为「${nick}」。` };
          }
        }
        return { ok: false, message: `未知动作 ${action}；支持 show/set/reset/enable/disable/昵称` };
      },
    },
  ];

  try {
    const injectFn = (ctx as unknown as { inject?: (services: string[], cb: (hostCtx: Record<string, unknown>) => void) => void }).inject;
    if (typeof injectFn === 'function') injectFn(['commands'], (hostCtx: Record<string, unknown>) => {
      const commands = hostCtx.commands as { register(def: unknown): unknown } | undefined;
      if (commands !== undefined && typeof commands.register === 'function') {
        for (const def of commandExports) commands.register(def);
        log('info', `commands registered: /soul (${commandExports.length} def)`);
      } else {
        log('warn', 'commands service not found — /soul command disabled');
      }
    });
    else log('warn', 'ctx.inject unavailable — commands disabled');
  } catch (error) {
    log('error', `command registration failed: ${String(error)}`);
  }

  // ---- set_persona agent tool ---------------------------------------------
  try {
    const harness = (typeof global !== 'undefined' ? (global as { harness?: { defineTool?: unknown; registerTool?: unknown; handle?: unknown } }) : undefined)?.harness;
    if (harness !== undefined && typeof harness.defineTool === 'function' && typeof harness.registerTool === 'function') {
      const defineTool = harness.defineTool as (def: unknown) => unknown;
      const registerTool = harness.registerTool as (ctx: unknown, def: unknown) => unknown;
      const toolDef = defineTool({
        name: 'set_persona',
        description: '修改当前 dsh-soul 人设（昵称/回复风格/语言/自定义指令）。只在用户明确请求改变称呼、语气、风格或语言时调用。',
        parameters: {
          type: 'object',
          properties: {
            style: { type: 'string', enum: ['default', 'professional', 'friendly', 'straight', 'whimsical', 'pragmatic', 'roast', 'coaching', 'humorous'], description: '回复风格' },
            language: { type: 'string', enum: ['zh', 'en'], description: '回复语言' },
            nickname: { type: 'string', description: '用户希望使用的称呼' },
            customInstructions: { type: 'string', description: '新的自定义指令' },
          },
          additionalProperties: false,
        },
        output: {
          schema: { type: 'object', properties: { ok: { type: 'boolean' } }, additionalProperties: true },
          render: (_a: unknown, v: { ok: boolean; applied?: string }) => [{ type: 'text', text: v?.ok ? `人设已更新：${v.applied ?? '配置变更'}，下次回复生效。` : '人设更新失败。' }],
        },
        async execute(input: { style?: string; language?: string; nickname?: string; customInstructions?: string }) {
          const next: SoulConfigV2 = { ...state.config };
          const loose: Record<string, unknown> = next as unknown as Record<string, unknown>;
          const applied: string[] = [];
          if (typeof input?.style === 'string' && STYLE_IDS.includes(input.style as StyleId)) { loose.style = input.style; applied.push(`style=${input.style}`); }
          if (typeof input?.language === 'string' && LANGUAGE_IDS.includes(input.language as 'zh' | 'en')) { loose.language = input.language; applied.push(`language=${input.language}`); }
          if (typeof input?.nickname === 'string' && input.nickname.length <= LIMITS.nickname) { loose.nickname = input.nickname; applied.push(`nickname=「${input.nickname.slice(0, 20)}」`); }
          if (typeof input?.customInstructions === 'string') { loose.customInstructions = input.customInstructions.slice(0, LIMITS.customInstructions); applied.push('customInstructions 已更新'); }
          if (applied.length === 0) return { ok: false, message: '没有可应用的变更' };
          const saved = saveConfig(ctx, next, true);
          if (!saved.ok) return { ok: false, message: `保存失败: ${(saved.errors ?? []).join('; ')}` };
          state.config = next as SoulConfigV2;
          return { ok: true, applied: applied.join('，') };
        },
      });
      registerTool(ctx, toolDef);
      log('info', 'set_persona tool registered');
    } else {
      log('warn', 'harness tool registry not available — set_persona disabled');
    }
  } catch (error) {
    log('error', `tool registration failed: ${String(error)}`);
  }

  // One-shot md import marker (settings namespace read is host-specific; the
  // file-level path stays for the migration panel in MV3).
  try {
    const md = importFromMd(undefined, null);
    if (md.skipped) log('info', 'soul-md import: no prior data (skipping)');
  } catch { /* import is best-effort in MV1 */ }

  log('info', `loaded; style=${String(state.config.style)} language=${state.config.language} enabled=${String(state.config.enabled)}`);

  return {
    dispose(): void {
      for (const off of runningTools) { try { off(); } catch { /* best effort */ } }
      log('info', 'disposed');
    },
  };
}

export default apply;

export { createDefaultConfig, compilePrompt, GLOBAL_NOTE, LIMITS, SCHEMA_VERSION, PLUGIN_ID, loadConfig, saveConfig, soulDir, configPath };
export type { SoulConfigV2, StyleId };
