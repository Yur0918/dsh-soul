/**
 * legacy 单测：v1 旧路径自动发现（$DSH_HOME/soul-config.json）与双装冲突检测。
 *
 *  - ① 新路径缺失 + 旧路径 v1 文件 → 只读迁移成功，字段符合 v2 schema；
 *  - ② 旧文件在 load 与后续 save 后保持字节不变（只读红线）；
 *  - ③ 新路径已有有效 v2 配置 → 优先于旧路径（老用户行为零变化）；
 *  - ④ detectConflictingSoulPlugins：dsh-soul / dsh-soul-md 命中、
 *      仅 @yur0918/dsh-soul 不命中、无 profiles 目录 → 空数组；
 *  - ⑤ 两路径都缺失 → 默认值且无异常。
 *  - ⑥ 旧路径出现 v2 形状文件 → 原样采纳，不做有损 v1 迁移。
 *
 * env 方案沿用 audit/confirm 的 tmp 目录模式：DSH_HOME 指向 mkdtemp 目录，
 * afterEach 恢复环境并清理。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig } from '../src/plugin';
import {
  detectConflictingSoulPlugins,
  legacyConfigPath,
  resetLegacyNoticeForTests,
} from '../src/config/legacy';
import { createDefaultConfig } from '../src/config/schema';

let dir: string;
let prevDshHome: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'soul-legacy-'));
  prevDshHome = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  resetLegacyNoticeForTests();
});

afterEach(async () => {
  if (prevDshHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = prevDshHome;
  await rm(dir, { recursive: true, force: true });
});

/** loadConfig/saveConfig 只消费 ctx.logger；get 为最小桩 */
function makeCtx(logs: string[] = []): {
  get<T>(name: string): T | undefined;
  logger: { info(m: string): void };
} {
  return {
    get: <T>(_: string): T | undefined => undefined,
    logger: { info: (m: string) => { logs.push(m); } },
  };
}

async function writeLegacyV1(content: string): Promise<void> {
  await writeFile(join(dir, 'soul-config.json'), content, 'utf8');
}

const NEW_PATH = (): string => join(dir, 'soul', 'soul-config.json');
const LEGACY_PATH = (): string => join(dir, 'soul-config.json');

describe('loadConfig 旧路径自动发现（v1 → v2）', () => {
  it('① 新路径缺失 + 旧路径 v1 文件 → 迁移成功返回，字段符合 v2 schema', async () => {
    const logs: string[] = [];
    await writeLegacyV1(JSON.stringify({
      nickname: '老王',
      style: 'efficient',
      customInstructions: '先给结论',
      personas: { 打工蛇: { style: 'casual' } },
    }));
    const cfg = loadConfig(makeCtx(logs));

    // v1 字段保留 + 迁移标记
    expect(cfg.version).toBe(2);
    expect(cfg.nickname).toBe('老王');
    expect(cfg.style).toBe('pragmatic'); // efficient → pragmatic 别名映射
    expect(cfg.customInstructions).toBe('先给结论');
    expect(cfg.importedFrom).toBe('dsh-soul-v1');
    expect(cfg.personas['打工蛇'].style).toBe('friendly'); // casual → friendly
    // v2 schema 容器字段完备
    expect(cfg.traits).toEqual({ headings: 'default', emoji: 'default' });
    expect(Array.isArray(cfg.cards)).toBe(true);
    expect(cfg.memory).toEqual(createDefaultConfig().memory);
    expect(cfg.evolution).toEqual(createDefaultConfig().evolution);
    expect(cfg.audit).toEqual(createDefaultConfig().audit);
    expect(cfg.behavior).toEqual(createDefaultConfig().behavior);

    // 一次性提示（含旧路径，[dsh-soul] 前缀）
    expect(logs.join('\n')).toContain('[dsh-soul]');
    expect(logs.join('\n')).toContain(LEGACY_PATH());

    // 只读：新路径文件未被创建（首次 save 才持久化）
    expect(existsSync(NEW_PATH())).toBe(false);
  });

  it('② 旧文件在 load 与后续 save 后保持原样（字节不变）', async () => {
    // 故意用紧凑格式 + 无尾换行，任何重写都会改变字节
    const raw = '{"nickname":"老王","style":"casual"}';
    await writeLegacyV1(raw);

    const cfg = loadConfig(makeCtx());
    expect(cfg.importedFrom).toBe('dsh-soul-v1');

    const saved = saveConfig(makeCtx(), cfg, true);
    expect(saved.ok).toBe(true);

    // 旧文件逐字节保持原样；新路径生成 v2 文件
    expect(await readFile(LEGACY_PATH(), 'utf8')).toBe(raw);
    expect(existsSync(NEW_PATH())).toBe(true);
  });

  it('③ 新路径已有有效 v2 配置 → 优先于旧路径（老用户行为零变化）', async () => {
    const v2 = { ...createDefaultConfig(), nickname: '新配置', style: 'roast' as const };
    await mkdir(join(dir, 'soul'), { recursive: true });
    await writeFile(NEW_PATH(), JSON.stringify(v2, null, 2), 'utf8');
    await writeLegacyV1(JSON.stringify({ nickname: '旧配置', style: 'casual' }));

    const logs: string[] = [];
    const cfg = loadConfig(makeCtx(logs));

    expect(cfg.nickname).toBe('新配置');
    expect(cfg.style).toBe('roast');
    expect(cfg.importedFrom).toBeNull(); // 未走 v1 迁移
    expect(logs.join('\n')).not.toContain(LEGACY_PATH()); // 无旧路径提示
    expect(existsSync(LEGACY_PATH())).toBe(true); // 旧文件未动
  });

  it('⑥ 旧路径出现 v2 形状文件（如手工挪动）→ 原样采纳，不做有损 v1 迁移', async () => {
    const v2 = { ...createDefaultConfig(), nickname: '挪过来的', style: 'roast' as const };
    const raw = JSON.stringify(v2, null, 2);
    await writeLegacyV1(raw);

    const logs: string[] = [];
    const cfg = loadConfig(makeCtx(logs));

    expect(cfg.nickname).toBe('挪过来的');
    expect(cfg.style).toBe('roast');
    expect(cfg.importedFrom).toBeNull(); // 不打 v1 迁移标记
    expect(cfg.memory).toEqual(createDefaultConfig().memory); // v2 专属字段未丢
    expect(logs.join('\n')).not.toContain('legacy v1 config'); // 不走 v1 迁移口径
    expect(await readFile(LEGACY_PATH(), 'utf8')).toBe(raw); // 只读红线
    expect(existsSync(NEW_PATH())).toBe(false); // 未落盘
  });

  it('⑤ 两路径都缺失 → 默认值且无异常、无提示', () => {
    const logs: string[] = [];
    const cfg = loadConfig(makeCtx(logs));
    expect(cfg).toEqual(createDefaultConfig());
    expect(logs).toHaveLength(0);
  });

  it('旧路径文件损坏（非法 JSON）→ 静默回退默认值，不抛错', async () => {
    await writeLegacyV1('{not json');
    const logs: string[] = [];
    const cfg = loadConfig(makeCtx(logs));
    expect(cfg).toEqual(createDefaultConfig());
    expect(logs).toHaveLength(0);
  });

  it('一次性提示：同一路径多次 load 只提示一次', async () => {
    await writeLegacyV1('{"nickname":"小明"}');
    const logs: string[] = [];
    loadConfig(makeCtx(logs));
    loadConfig(makeCtx(logs));
    const notices = logs.filter((m) => m.includes(LEGACY_PATH()));
    expect(notices).toHaveLength(1);
  });
});

describe('detectConflictingSoulPlugins（双装冲突检测）', () => {
  it('④ 含 dsh-soul / dsh-soul-md 的 profile → 命中（去重排序，跨依赖段去重）', async () => {
    await mkdir(join(dir, 'profiles', 'p1'), { recursive: true });
    await mkdir(join(dir, 'profiles', 'p2'), { recursive: true });
    await writeFile(join(dir, 'profiles', 'p1', 'package.json'), JSON.stringify({
      dependencies: { 'dsh-soul': '^1.0.0' },
      devDependencies: { 'dsh-soul-md': '^0.4.0' },
    }), 'utf8');
    // p2：dsh-soul 与 p1 重复（去重），@yur0918/dsh-soul 为白名单不算冲突
    await writeFile(join(dir, 'profiles', 'p2', 'package.json'), JSON.stringify({
      optionalDependencies: { 'dsh-soul': '^1.0.0', '@yur0918/dsh-soul': '^2.0.0' },
    }), 'utf8');
    expect(detectConflictingSoulPlugins(dir)).toEqual(['dsh-soul', 'dsh-soul-md']);
  });

  it('④ 仅 @yur0918/dsh-soul（本包）→ 不命中', async () => {
    await mkdir(join(dir, 'profiles', 'ok'), { recursive: true });
    await writeFile(join(dir, 'profiles', 'ok', 'package.json'), JSON.stringify({
      dependencies: { '@yur0918/dsh-soul': '^2.0.0', 'dsh-utils': '^1.0.0' },
    }), 'utf8');
    expect(detectConflictingSoulPlugins(dir)).toEqual([]);
  });

  it('④ 无 profiles 目录 → 空数组', () => {
    expect(detectConflictingSoulPlugins(dir)).toEqual([]);
  });

  it('损坏 package.json 跳过；profiles 下散文件不抛错；子串匹配命中第三方 fork', async () => {
    await mkdir(join(dir, 'profiles', 'bad'), { recursive: true });
    await writeFile(join(dir, 'profiles', 'bad', 'package.json'), '{oops', 'utf8');
    await mkdir(join(dir, 'profiles', 'good'), { recursive: true });
    await writeFile(join(dir, 'profiles', 'good', 'package.json'), JSON.stringify({
      dependencies: { '@third/dsh-soul-fork': '*', 'unrelated-pkg': '^1.0.0' },
    }), 'utf8');
    await writeFile(join(dir, 'profiles', 'stray-file.txt'), 'not a profile dir', 'utf8');
    expect(detectConflictingSoulPlugins(dir)).toEqual(['@third/dsh-soul-fork']);
  });
});

describe('legacyConfigPath（旧路径推导）', () => {
  it('soulDir 的上一级 / soul-config.json（即 $DSH_HOME/soul-config.json）', () => {
    expect(legacyConfigPath('/home/yur/.dsh/soul')).toBe(join('/home/yur/.dsh', 'soul-config.json'));
  });
});
