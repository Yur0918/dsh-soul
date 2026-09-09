/**
 * dsh-soul v2 UI 组件清单（骨架注释，不要求真实 React 编译；
 * 本目录已被 tsconfig.json exclude，接入宿主 UI 后以真实组件替换）。
 *
 * ⚠️ 本文件不导出任何可执行代码——仅描述 Tab 结构与组件职责，供 MV1 集成期照单实现。
 *
 * ============================ UI Tab 结构 ============================
 *
 * 设置页（settings.tab 注册，沿用 v1 本地化机制 zh/en）：
 *
 *   Tab 1: AboutStyle 关于你与风格（AboutStyle.tsx）
 *     - nickname / occupation / bio 输入（≤50/50/500）
 *     - style 下拉：9 项（styles.ts STYLES），实时预览「当前生效提示词」
 *     - traits：headings / emoji 各 default/more/less 三选
 *     - language：zh / en
 *     - customInstructions（≤2000）
 *     - 「查看当前生效提示词」只读面板（AboutStyle.tsx 内嵌；含人设卡来源链注释）
 *
 *   Tab 2: CardManager 人设卡（CardManager.tsx）
 *     - 卡片 CRUD（name + markdown content ≤16KB，保存端 {{ 变量校验）
 *     - 默认卡（cardActive）选择；workspace 下拉映射（cardWorkspaces）
 *     - 会话头切换说明（cardSessions 由会话头写入）
 *     - 当前会话/workspace 各卡解析结果展示（resolveActiveCard）
 *
 *   Tab 3: PresetManager 人设预设库（PresetManager.tsx）
 *     - personas 快照 CRUD（save/use/list/del；快照维持 v1 字段集合，卡片/行为不入快照）
 *
 *   Tab 4: MemoryAudit 记忆与演化（MemoryAudit.tsx）
 *     - 记忆文件状态（global.md / <card-slug>.md 大小、字节数）
 *     - memory.maxBytes / inject / injectMaxChars / order
 *     - evolution 三模式开关（默认 confirm，UI 建议保持）
 *     - 审计面板（soul-audit.jsonl：时间/tool/status 过滤，每条可一键还原）
 *
 *   Tab 5: BehaviorPrefs 行为偏好（BehaviorPrefs.tsx）
 *     - welcome（enabled/text/showEveryTime/seenSessionIds 重置按钮）
 *     - fileChanges（enabled/mode=summary/maxLines；默认 summary，diff 需显式开启）
 *
 *   Tab 6: MigrationPanel 迁移与兼容（MigrationPanel.tsx）
 *     - 导入状态（importedFrom：v1 / dsh-soul-md / legacy）
 *     - 清理旧数据按钮（soul-md 目录，二次确认）
 *     - 双插件同装告警（检测到 dsh-soul-md → "二选一" 指引）
 *
 * ============================ 组件清单 ============================
 * AboutStyle.tsx / CardManager.tsx / PresetManager.tsx /
 * MemoryAudit.tsx / BehaviorPrefs.tsx / MigrationPanel.tsx / index.tsx（Tab 容器）
 */

export {};
