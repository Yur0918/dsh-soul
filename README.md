# dsh-soul v2（SoulFusion）

dsh-soul × dsh-soul-md 融合增强插件：**人设卡 + 记忆 + 审计 + 自演化**一体化人设插件。

包名沿用 `dsh-soul`，版本 **2.0.0**（major 升级，升级即迁移、旧配置无损）。

## 开发状态

| 项目 | 状态 |
|---|---|
| 核心逻辑单元测试 | ✅ **62 / 62 通过**（6 个测试文件：styles / compilePrompt / validate / migrate / confirm / audit） |
| 构建检查 | ✅ `npm run build`（tsc -p tsconfig.json）零错误 |
| 依赖安装 | ✅ `npm install` 成功（vitest 2.x / typescript 5.x；peerDeps 均为 optional 声明，无需真实安装） |

```
Test Files  6 passed (6)
Tests       62 passed (62)
```

> 本仓库为**可测试骨架**：核心逻辑（配置/迁移/编译/记忆/审计/确认）全部纯函数实现并有单测覆盖；
> DSH 运行时接入（systemPrompt 注册 / agent.inject）与 UI 组件仅以「适配层接口 + 骨架注释」存在（见 `src/bridge/`、`src/ui/`），不产生真实 DSH 调用、不污染本机环境。

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
dsh plugin --profile web add dsh-soul

# 升级（v1 → v2 自动迁移，旧配置备份后无损升级）
dsh plugin --profile web update dsh-soul
```

> peerDependencies 声明（`@deepseek-ai/dsh-system-prompt` 系列）为契约占位，
> 以 `peerDependenciesMeta.optional` 标记，**不必真实安装**；本机无 DSH 环境的开发/测试不受影响。

## /soul 命令表

| 命令 | 说明 |
|---|---|
| `/soul` | 查看当前生效配置摘要（含来源链：设置 / 会话卡 / workspace 卡 / 默认卡 / 无） |
| `/soul show` | 完整查看当前生效人设与各段字符数（persona / memory） |
| `/soul on` / `/soul off` | 启用/停用个性化（`enabled`；停用时注入与记忆/行为全部停用，配置保留） |
| `/soul set <field> <value>` | 设置字段：nickname / occupation / bio / style / traits.headings / traits.emoji / language / customInstructions |
| `/soul set style=humorous` | 设置风格（9 值；v1 旧值 `efficient`/`casual` 提示迁移） |
| `/soul card list / add / show / activate` | 人设卡管理（CRUD、设置默认卡） |
| `/soul memory show / reset` | 记忆查看 / 重置（global 或当前卡域） |
| `/soul confirm [id]` | 确认 pending 提案（set_persona / soul_update / memory_rewrite） |
| `/soul reject [id]` | 拒绝 pending 提案 |
| `/soul audit [filter]` | 审计记录查看（按 tool / status / 时间过滤） |
| `/soul save <name>` / `/soul use <name>` / `/soul list` / `/soul del <name>` | 人设预设库（v1 快照语义：结构化字段快照，卡片/行为不入快照） |
| `/soul import md` | 一次性导入 dsh-soul-md 配置与卡片（幂等） |

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
├── bridge/    systemPrompt.ts / inject.ts（适配层接口声明，无真实调用）
├── ui/        index.tsx（Tab 结构组件清单注释骨架）
└── index.ts   纯函数 API 汇聚
tests/         styles / compilePrompt / validate / migrate / confirm / audit（vitest 单测）
```

## 许可

MIT
