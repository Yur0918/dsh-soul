/**
 * legacy.ts — v1 旧版兼容（只读）
 *
 * 两条能力，均不写盘、不删改任何旧文件：
 *  1) 旧路径自动发现：v1 配置位于 $DSH_HOME/soul-config.json（home 根，即
 *     v2 soulDir 的上一级）。v2 新路径 soul/soul-config.json 缺失时回读旧路径，
 *     交由 migrateV1ToV2 得到 v2 配置（内存迁移）；首次 saveConfig 才持久化
 *     到新路径（saveConfig 现有行为）。
 *  2) 双装冲突检测：扫描 $DSH_HOME/profiles/<profile>/package.json 的依赖键名，
 *     收集包含 "dsh-soul" 但非本包（@yur0918/dsh-soul）的包名 —— v1 的
 *     `dsh-soul`、第三方的 `dsh-soul-md` 等会与本插件的 prompt 段名/命令面
 *     冲突（prompt 段重复注入）。扫描只读，任何 IO 异常吞掉返回空数组。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isRecord } from './validate';

/** 本插件包名（双装冲突检测的白名单键：等于它不算冲突） */
export const SELF_PACKAGE_NAME = '@yur0918/dsh-soul';

/** 扫描的依赖段（键名集合；只看键名，不看版本） */
const DEP_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

/* ============================ 旧路径发现 ============================ */

/** v1 旧路径：soulDir 的上一级 / soul-config.json（即 $DSH_HOME/soul-config.json） */
export function legacyConfigPath(soulDirPath: string): string {
  return join(dirname(soulDirPath), 'soul-config.json');
}

export interface LegacyV1Read {
  /** 旧文件绝对路径（供一次性提示引用） */
  path: string;
  /** parse 后的原始 JSON（可能是任意 JSON 形态，由 migrateV1ToV2 容错） */
  raw: unknown;
}

/**
 * 回读 v1 旧路径配置（只读）。
 * 文件缺失 / 不可读 / JSON 损坏 → null（不抛错，调用方回退默认值）。
 * 注意：这里不判断 schema —— 只要能 parse 就交给 migrateV1ToV2 容错迁移。
 */
export function readLegacyV1Raw(soulDirPath: string): LegacyV1Read | null {
  const path = legacyConfigPath(soulDirPath);
  try {
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return { path, raw };
  } catch {
    return null;
  }
}

/* ====================== 一次性发现提示（进程级去重） ====================== */

/** 已提示过的旧路径集合（进程级：同一路径只提示一次） */
const legacyNoticed = new Set<string>();

/** 测试辅助：清空一次性提示去重状态 */
export function resetLegacyNoticeForTests(): void {
  legacyNoticed.clear();
}

/**
 * 旧配置被发现时输出一次性提示（含旧路径与新路径），格式对齐 `[dsh-soul] ...`。
 * 优先 ctx.logger.info，缺省回退 console.info；logger 抛错吞掉。
 */
export function noticeLegacyConfig(
  logger: { info?(m: string): void } | undefined,
  legacyPath: string,
  newPath: string,
): void {
  if (legacyNoticed.has(legacyPath)) return;
  legacyNoticed.add(legacyPath);
  const line =
    `[dsh-soul] legacy v1 config found at ${legacyPath}; migrated to v2 in memory (old file untouched) ` +
    `— first save persists to ${newPath}`;
  try {
    if (typeof logger?.info === 'function') logger.info(line);
    else console.info(line);
  } catch { /* logger optional */ }
}

/* ============================ 双装冲突检测 ============================ */

/**
 * 双装冲突检测：扫描 $DSH_HOME/profiles/<profile>/package.json 的
 * dependencies / devDependencies / optionalDependencies 的键名,
 * 收集包含 "dsh-soul" 且不等于 @yur0918/dsh-soul 的包名，去重排序返回。
 *
 * 只读扫描；单个 profile 不可读/损坏则跳过，目录级 IO 异常吞掉返回空数组，绝不抛错。
 */
export function detectConflictingSoulPlugins(dshHome: string): string[] {
  const hits = new Set<string>();
  try {
    const profilesDir = join(dshHome, 'profiles');
    if (!existsSync(profilesDir)) return [];
    let profileNames: string[] = [];
    try {
      profileNames = readdirSync(profilesDir);
    } catch {
      return [];
    }
    for (const name of profileNames) {
      const pkgPath = join(profilesDir, name, 'package.json');
      let pkgRaw: string;
      try {
        if (!existsSync(pkgPath)) continue;
        pkgRaw = readFileSync(pkgPath, 'utf8');
      } catch {
        continue; // 单个 profile 不可读：跳过，不影响其余
      }
      let pkg: unknown;
      try {
        pkg = JSON.parse(pkgRaw) as unknown;
      } catch {
        continue; // 损坏的 package.json：跳过
      }
      if (!isRecord(pkg)) continue;
      for (const section of DEP_SECTIONS) {
        const deps = pkg[section];
        if (!isRecord(deps)) continue;
        for (const depName of Object.keys(deps)) {
          if (depName.includes('dsh-soul') && depName !== SELF_PACKAGE_NAME) hits.add(depName);
        }
      }
    }
  } catch {
    return []; // 任何 IO 异常：吞掉返回空数组（只读扫描，绝不抛错）
  }
  return [...hits].sort();
}
