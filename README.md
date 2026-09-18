# dsh-soul v2（SoulFusion）

dsh-soul × dsh-soul-md 融合增强插件：**人设卡 + 记忆 + 审计 + 自演化**一体化人设插件。

包名沿用 `dsh-soul`，版本 **2.0.0**（major 升级，升级即迁移、旧配置无损）。

## 开发状态

**已验证（2026-09-09，dsh web 0.1.1-rc.2）**：设置页「个性化」分区保存 `style=roast` 经 `/dsh-soul/config` 生效（日志 `config saved via HTTP (style=roast)`）；prompt 段 `soul:persona`/`soul:memory` 惰性注册、下一次回复生效。

| 项目 | 状态 |
|---|---|
| 核心逻辑单元测试 | ✅ **74 / 74 通过**（7 个测试文件：styles / compilePrompt / validate / migrate / confirm / audit / legacy） |
| 构建检查 | ✅ `npm run build`（tsc -p tsconfig.json）零错误；`tsc --noEmit` 零错误 |
| 依赖安装 | ✅ `npm install` 成功（vitest 2.x / typescript 5.x；peerDeps 均为 optional 声明，无需真实安装） |
| 运行时接入 | ✅ prompt 段 / `/soul` 命令 / `/dsh-soul/config` HTTP API / 设置分区，本机 dsh web 0.1.5+ 验证加载 |

```
Test Files  7 passed (7)
Tests       74 passed (74)
```

> 本仓库为**可测试骨架 + 真实运行时接入**的混合体：核心逻辑（配置/迁移/编译/记忆/审计/确认）全部纯函数实现并有单测覆盖；DSH 运行时接入已真实落地——`plugin.ts` 注册 `soul:persona` / `soul:memory` prompt 段、`/soul` 命令（show/set/reset/enable/disable）、`/dsh-soul/config` HTTP API 与设置页「个性化」分区，并在本机 dsh web 加载验证。6 Tab 面板、记忆/审计/确认槽的 runtime 接线、md 导入仍属 MV2/MV3 范围（见「/soul 命令表」规划区）。

## 功能清单

- **配置 schema v2**：v1 全字段保留 + md 字段（cards / cardActive / cardSessions / cardWorkspaces / workspaceList / memory.*）+ 新增板块（evolution / audit / behavior / importedFrom）
- **校验**：字段白名单 + 类型 + 长度 + 枚举；未知字段**整单拒绝**，非法返回字段级错误明细
- **迁移**：
  - v1 → v2：style 别名表（`efficient→pragmatic`、`casual→friendly`、`humorous→humorous` 保留第 9 风格）、traits 归一化（对象/平铺兼容）、备份标记 `importedFrom`
  - dsh-soul-md → v2：cards/active/sessions/workspaces/memory.* 映射 + ≤v0.4 legacy path 字段兜底；`importedFrom` 幂等（二次导入跳过）
- **9 种回复风格**（zh/en 双语文案）：default / professional / friendly / straight / whimsical / pragmatic / roast / coaching / **humorous**（v2 新增）
- **prompt 编译流水线**：全局注记（风格 ≤ 任务指令/准确性/安全）→ 关于你 → 风格段（含示例与禁止项）→ 特质修饰 → 语言 → 自定义指令 → 人设卡加性层 → 记忆段（头截断 `injectMaxChars`）
- **记忆服务**：`global.md` / `<card-slug>.md` 分域读写；`maxBytes` 超限拒绝写入；注入取文件头
- **审计**：`soul-audit.jsonl` append-only；条目 `{ts, sessionId, actor, tool, target, oldHash, newText, status, source}`；status：`pending | applied | rejected | superseded | expired`
- **确认槽**：按 tool 分槽（`set_persona` / `soul_update` / `memory_rewrite` 各一槽）；confirm / reject / 替换（superseded）/ 过期

## 安装

```bash
# 首次安装
dsh plugin --profile web add @yur0918/dsh-soul

# 升级（v1 → v2 自动迁移，旧配置备份后无损升级）
dsh plugin --profile web update dsh-soul
```

> peerDependencies 声明（`@deepseek-ai/dsh-system-prompt` 系列）为契约占位，
> 以 `peerDependenciesMeta.optional` 标记，**不必真实安装**；本机无 DSH 环境的开发/测试不受影响。

## /soul 命令表

当前已实现并在本机验证加载的命令面（其余为 v1 语义参考、MV2/MV3 规划范围，见「开发状态」）：

| 命令 | 状态 |
|---|---|
| `/soul` / `/soul show` | ✅ 已实现 —— 查看当前生效配置摘要（昵称/风格/语言/人设卡数/记忆注入等） |
| `/soul set <field> <value>` | ✅ 已实现 —— style / language / nickname / occupation / bio / customInstructions（traits 字段走设置页 API） |
| `/soul reset` | ✅ 已实现 —— 恢复默认配置 |
| `/soul enable` / `/soul disable` | ✅ 已实现 —— 启用/停用个性化（配置保留） |

> 下表为 v1 语义参考与 MV2/MV3 规划，**尚未在本仓实现**，勿当作当前功能使用：

| 命令 | 规划 |
|---|---|
| `/soul card list / add / show / activate` | 人设卡管理（卡片存储已就绪，命令面在 MV2） |
| `/soul memory show / reset` | 记忆查看 / 重置（MV2） |
| `/soul confirm [id]` / `/soul reject [id]` | 提案确认/拒绝（确认槽运行时接线在 MV2） |
| `/soul audit [filter]` | 审计记录查看（jsonl 已落盘，查询命令在 MV2） |
| `/soul save <name>` / `/soul use <name>` / `/soul list` / `/soul del <name>` | 人设预设库（MV3） |
| `/soul import md` | dsh-soul-md 导入（MV3；v1 旧配置自动发现已在 2.0.1 落地） |

## 9 种回复风格

| id | 中文 | English | 要点 |
|---|---|---|---|
| `default` | 默认 | Default | 自然中性，不施加额外风格约束 |
| `professional` | 专业严谨 | Professional & Rigorous | 结论先行、术语准确、标注假设 |
| `friendly` | 亲和友善 | Friendly & Warm | 温暖鼓励、先共情后建议 |
| `straight` | 直言不讳 | Straightforward & Blunt | 直接给结论与风险，批评对事不对人 |
| `whimsical` | 天马行空 | Whimsical & Imaginative | 比喻与跨界联想，落回可执行结论 |
| `pragmatic` | 高效务实 | Pragmatic & Efficient | 行动优先、优先级与取舍 |
| `roast` | 毒舌吐槽 | Roasty & Snarky | 犀利不伤人，严肃话题自动收敛 |
| `coaching` | 启发引导 | Coaching & Socratic | 提问导向，给框架与方向性总结 |
| `humorous` | 幽默风趣 | Witty & Humorous | **v2 新增**：机智幽默、笑点不伤信息量；严肃话题自动收敛；禁止人身攻击/无信息量玩笑/连续玩梗 |

> 所有风格共用全局注记：**风格只约束表达方式与语气，不改变任务要求、事实准确性与安全约束；与任务指令冲突时以任务指令为准；不得干扰工具调用与结构化输出格式。**

## 与 dsh-soul-md 的关系（二选一）

- dsh-soul v2 **已内置 dsh-soul-md 全部能力**（人设卡、会话/workspace 切换、记忆注入），不依赖其包；
- 请**卸载 dsh-soul-md，二选一安装**：两个插件同装会同时注册 `soul:persona` 段，可能叠加/冲突；
- md 用户请先执行 `/soul import md` 一次性导入（含 ≤v0.4 legacy path 兜底），记忆文件迁移后原目录保留，可在 UI「迁移与兼容」Tab 二次确认清理。

## 目录结构

```
src/
├── config/    schema.ts（字段/常量/默认值）· validate.ts（白名单+类型+长度+枚举）· migrate.ts（v1/md 迁移）
├── prompt/    styles.ts（9 风格文案）· compilePrompt.ts（流水线）· sections.ts（order 常量）
├── memory/    service.ts（记忆读写/截断）· audit.ts（append-only 审计）· confirm.ts（按 tool 分槽）
├── bridge/    systemPrompt.ts / inject.ts（运行时接线适配层；systemPrompt 已真实注册）
├── ui/        index.tsx（Tab 结构组件清单注释骨架）
└── index.ts   纯函数 API 汇聚
tests/         styles / compilePrompt / validate / migrate / confirm / audit（vitest 单测）
```

## 许可

MIT
