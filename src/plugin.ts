/**
 * dsh-soul v2（SoulFusion）— 最小插件装配入口（MV1 骨架）。
 *
 * 定位：可安装、可加载、尽力注册的骨架版。
 *  - 尝试向宿主注册 `soul:persona`（order 0.1）与 `soul:memory`（order 0.5）
 *    prompt section（依赖宿主 systemPrompt 服务；API 名称以运行环境为准，
 *    bridge 适配层兜底）；
 *  - 缺服务时只告警不崩溃，保证插件树不受影响；
 *  - UI 设置页 / /soul 命令 / 工具注册为 MV1 集成期工作（见 docs 注释与 README）。
 */
import { createDefaultConfig, isV2Config, LIMITS } from './config/schema';
import { validateConfig } from './config/validate';
import { compilePrompt, GLOBAL_NOTE } from './prompt/compilePrompt';
import { SECTION_ORDER } from './prompt/sections';

interface SoulPluginContext {
  get<T = unknown>(name: string): T | undefined;
  logger?: { info?(message: string): void; warn(message: string): void; error(message: string): void };
  [key: string]: unknown;
}

const PLUGIN_ID = 'soul';

/** Locate the plugin's per-user state dir (best effort; host may not expose it). */
function stateDir(ctx: SoulPluginContext): string {
  const home = process.env.DSH_HOME ?? process.env.HOME ?? '/tmp';
  return `${home}/soul`;
}

/**
 * Render the current config into prompt sections.
 * The config lives in memory for the skeleton (persistence lands with the
 * settings UI); every semantic is carried through the same compilePrompt
 * pipeline the final plugin uses.
 */
function renderSections(config: ReturnType<typeof createDefaultConfig>): { persona: string; memory: string } {
  const compiled = compilePrompt({ config });
  return { persona: compiled.persona, memory: compiled.memory };
}

export function apply(ctx: SoulPluginContext): void | { dispose(): void } {
  const log = (level: 'info' | 'warn' | 'error', msg: string): void => {
    try { ctx.logger?.[level]?.(`[dsh-soul] ${msg}`); } catch { /* logger optional */ }
  };

  let config = createDefaultConfig();
  try {
    const raw = process.env.DSH_SOUL_CONFIG;
    if (raw !== undefined) {
      const parsed = JSON.parse(raw) as unknown;
      if (isV2Config(parsed)) config = parsed as ReturnType<typeof createDefaultConfig>;
    }
  } catch {
    log('warn', 'DSH_SOUL_CONFIG parse failed; using defaults');
  }

  const validation = validateConfig(config);
  if (!validation.ok) {
    log('warn', `config rejected: ${validation.errors.map(e => e.path).join(', ')}; using defaults`);
    config = createDefaultConfig();
  }

  // Best-effort prompt-section registration via the host's systemPrompt
  // service. The exact access path is runtime-specific (bridge adapter
  // exists for this); absent the service we degrade to warn-only so the
  // plugin tree keeps booting — never crash the host over a persona.
  try {
    const sp = ctx.get<{
      section?(spec: { name: string; order: number; text: string | (() => string) }): unknown;
      variable?(name: string, value: unknown): unknown;
    }>('systemPrompt') ?? ctx.get<{ section?: unknown }>('dsh-system-prompt');

    if (sp !== undefined && typeof sp.section === 'function') {
      const sections = renderSections(config);
      sp.section({ name: 'soul:persona', order: SECTION_ORDER.persona, text: () => sections.persona });
      if (sections.memory !== '') {
        sp.section({ name: 'soul:memory', order: SECTION_ORDER.memory, text: () => sections.memory });
      }
      log('info', `prompt sections registered (persona@${SECTION_ORDER.persona}, memory@${SECTION_ORDER.memory})`);
    } else {
      log('warn', 'systemPrompt service not found — persona injection disabled (bridge adapter pending)');
    }
  } catch (error) {
    log('error', `section registration failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  log('info', `loaded; style=${String(config.style)} language=${config.language} cards=${Object.keys(config.cards).length} (skeleton)`);

  return {
    dispose(): void {
      log('info', 'disposed');
    },
  };
}

export default apply;

export { createDefaultConfig, compilePrompt, GLOBAL_NOTE, LIMITS, PLUGIN_ID, stateDir };
