# dsh-soul v2 (SoulFusion)

A merged enhancement plugin combining dsh-soul × dsh-soul-md: cards + memory + audit + self-evolution in one persona plugin.

Keeps the package name `dsh-soul`, version **2.0.0** (major upgrade; upgrading migrates, existing config is lossless).

中文：[README.md](README.md)

## Interface

Settings page → "Personalization" → the **About you & style** tab (9 styles + a read-only preview of the compiled prompt) and the **Memory & evolution** tab (memory file status + append-only audit + per-tool confirmation slots):

![dsh-soul settings page: the About-you-and-style tab with 9 reply styles and the "current effective prompt" preview; the Memory-and-evolution tab with memory file status, append-only audit entries and per-tool confirmation slots](./docs/ui-soul.png)

*(Interface sketch — layout and information hierarchy only; all figures and copy shown are illustrative, not real configuration.)*

## Development status

**Verified (2026-09-09, dsh web 0.1.1-rc.2)**: saving `style=roast` in the settings page's "Personalization" section takes effect through `/dsh-soul/config` (log `config saved via HTTP (style=roast)`); the `soul:persona` / `soul:memory` prompt sections are lazily registered and apply on the next reply.

| Item | Status |
|---|---|
| Core-logic unit tests | ✅ **74 / 74 passing** (7 test files: styles / compilePrompt / validate / migrate / confirm / audit / legacy) |
| Build check | ✅ `npm run build` (tsc -p tsconfig.json) with zero errors; `tsc --noEmit` zero errors |
| Dependency install | ✅ `npm install` succeeds (vitest 2.x / typescript 5.x; all peerDeps are declared optional, none need to actually be installed) |
| Runtime integration | ✅ prompt sections / `/soul` command / `/dsh-soul/config` HTTP API / settings section, loaded and verified on a local dsh web 0.1.5+ |

```
Test Files  7 passed (7)
Tests       74 passed (74)
```

> This repository is a hybrid of a **testable skeleton + real runtime integration**: all core logic (config / migration / compile / memory / audit / confirm) is implemented as pure functions with unit-test coverage; the DSH runtime integration is genuinely in place — `plugin.ts` registers the `soul:persona` / `soul:memory` prompt sections, the `/soul` command (show/set/reset/enable/disable), the `/dsh-soul/config` HTTP API and the settings-page "Personalization" section, and has been loaded and verified on a local dsh web. The 6-tab panel, the runtime wiring of memory/audit/confirmation slots, and md import remain in MV2/MV3 scope (see the roadmap in "/soul command table").

## Features

- **Config schema v2**: all v1 fields retained + md fields (cards / cardActive / cardSessions / cardWorkspaces / workspaceList / memory.*) + new sections (evolution / audit / behavior / importedFrom)
- **Validation**: field allow-list + type + length + enum; unknown fields are **rejected as a whole payload**, with field-level error details returned for invalid input
- **Migration**:
  - v1 → v2: style alias table (`efficient→pragmatic`, `casual→friendly`, `humorous→humorous` keeps the 9th style), trait normalization (object / flat both accepted), `importedFrom` backup marker
  - dsh-soul-md → v2: cards/active/sessions/workspaces/memory.* mapping + ≤v0.4 legacy path field fallback; `importedFrom` is idempotent (a second import is skipped)
- **9 reply styles** (bilingual zh/en copy): default / professional / friendly / straight / whimsical / pragmatic / roast / coaching / **humorous** (new in v2)
- **Prompt compile pipeline**: global note (style ≤ task instructions / accuracy / safety) → about you → style section (with examples and prohibitions) → trait modifiers → language → custom instructions → card additive layer → memory section (head-truncated by `injectMaxChars`)
- **Memory service**: `global.md` / `<card-slug>.md` scoped read/write; writes exceeding `maxBytes` are rejected; injection takes the head of the file
- **Audit**: `soul-audit.jsonl`, append-only; entries `{ts, sessionId, actor, tool, target, oldHash, newText, status, source}`; status: `pending | applied | rejected | superseded | expired`
- **Confirmation slots**: one slot per tool (`set_persona` / `soul_update` / `memory_rewrite`); confirm / reject / replace (superseded) / expire

## HTTP API (same-origin, web profile)

| Endpoint | Method | Description |
|---|---|---|
| `/dsh-soul/config` | GET / POST | Read / save config (used by the settings page; POST goes through validateConfig's whole-payload validation) |
| `/dsh-soul/prompt` | GET | Current compiled output: full `persona` / `memory` text + section names and order + character counts (what you see is what is injected) |
| `/dsh-soul/personas` | GET | Persona snapshot list (count / max=20 / full snapshots) |
| `/dsh-soul/personas?name=<key>` | POST / PUT | Add or overwrite a persona snapshot (body is a JSON snapshot, must contain at least `style`) |
| `/dsh-soul/personas?name=<key>` | DELETE | Delete a persona snapshot |
| `/dsh-soul/audit` | GET | Audit query + deviation report (`status/tool/sessionId/sinceTs/untilTs/limit` filters + `maxToolCallsPerSession` threshold) |

> v1 migration note: when the v2 config path is missing, the v1 user config file (`$DSH_HOME/soul-config.json`) is **auto-discovered read-only and migrated in memory**; it is written to the new path only on the first save (the old file is never rewritten). v1's `/api/soul/personas` counterpart endpoint is `/dsh-soul/personas` in the table above.

## Install

```bash
# First install
dsh plugin --profile web add @yur0918/dsh-soul

# Upgrade (v1 → v2 migrates automatically; lossless after backing up the old config)
dsh plugin --profile web update dsh-soul
```

> The peerDependencies declaration (`@deepseek-ai/dsh-system-prompt` series) is a contract placeholder
> marked with `peerDependenciesMeta.optional`, and **does not need to be actually installed**; local
> development / testing without a DSH environment is unaffected.

## /soul command table

The command surface currently implemented and verified as loading locally (everything else is v1 semantic reference and MV2/MV3 roadmap scope, see "Development status"):

| Command | Status |
|---|---|
| `/soul` / `/soul show` | ✅ Implemented — show the effective config summary (nickname / style / language / card count / memory injection, etc.) |
| `/soul set <field> <value>` | ✅ Implemented — style / language / nickname / occupation / bio / customInstructions (traits fields go through the settings-page API) |
| `/soul reset` | ✅ Implemented — restore the default config |
| `/soul enable` / `/soul disable` | ✅ Implemented — enable / disable personalization (config retained) |

> The table below is v1 semantic reference and MV2/MV3 roadmap: **not yet implemented in this repo**. Do not treat it as current functionality:

| Command | Roadmap |
|---|---|
| `/soul card list / add / show / activate` | Card management (card storage is ready; the command surface is MV2) |
| `/soul memory show / reset` | Memory view / reset (MV2) |
| `/soul confirm [id]` / `/soul reject [id]` | Proposal confirm / reject (confirmation-slot runtime wiring is MV2) |
| `/soul audit [filter]` | Audit record view (the jsonl is already written to disk; the query command is MV2) |
| `/soul save <name>` / `/soul use <name>` / `/soul list` / `/soul del <name>` | Persona preset library (MV3) |
| `/soul import md` | dsh-soul-md import (MV3; automatic discovery of legacy v1 config already landed in 2.0.1) |

## The 9 reply styles

| id | 中文 | English | Notes |
|---|---|---|---|
| `default` | 默认 | Default | Natural and neutral, no extra stylistic constraint |
| `professional` | 专业严谨 | Professional & Rigorous | Conclusion first, accurate terminology, assumptions labelled |
| `friendly` | 亲和友善 | Friendly & Warm | Warm and encouraging, empathy before advice |
| `straight` | 直言不讳 | Straightforward & Blunt | State conclusions and risks directly; critique the work, not the person |
| `whimsical` | 天马行空 | Whimsical & Imaginative | Metaphors and cross-domain associations, landing back on actionable conclusions |
| `pragmatic` | 高效务实 | Pragmatic & Efficient | Action first, priorities and trade-offs |
| `roast` | 毒舌吐槽 | Roasty & Snarky | Sharp but not hurtful; automatically backs off on serious topics |
| `coaching` | 启发引导 | Coaching & Socratic | Question-driven, gives frameworks and directional summaries |
| `humorous` | 幽默风趣 | Witty & Humorous | **New in v2**: witty humour whose jokes don't cost information; backs off on serious topics; personal attacks / information-free jokes / chained puns are prohibited |

> All styles share a global note: **style constrains expression and tone only; it does not change task requirements, factual accuracy or safety constraints; when it conflicts with task instructions, the task instructions win; it must not interfere with tool calls or structured output formats.**

## Relationship to dsh-soul-md (pick one)

- dsh-soul v2 **already includes all dsh-soul-md capabilities** (cards, session/workspace switching, memory injection) and does not depend on that package;
- Please **uninstall dsh-soul-md and install only one**: installing both registers the `soul:persona` section twice, which may stack or conflict;
- For md users: **`/soul import md` is MV3 roadmap and is not yet implemented in this repo** (see the roadmap in the "/soul command table"). The current version does not automatically read dsh-soul-md's cards or memory — migration must be done by hand; the field-mapping logic is `importFromMd` in `src/config/migrate.ts` (its `/soul import md` runtime entry is likewise pending MV3).

## Repository layout

```
src/
├── config/    schema.ts (fields/constants/defaults) · validate.ts (allow-list+type+length+enum) · migrate.ts (v1/md migration)
├── prompt/    styles.ts (9 style copy) · compilePrompt.ts (pipeline) · sections.ts (order constants)
├── memory/    service.ts (memory read/write/truncate) · audit.ts (append-only audit) · confirm.ts (per-tool slots)
├── bridge/    systemPrompt.ts / inject.ts (runtime wiring adapters; systemPrompt is really registered)
├── ui/        index.tsx (tab-structure component list, comment skeleton)
└── index.ts   pure-function API aggregation
tests/         styles / compilePrompt / validate / migrate / confirm / audit (vitest unit tests)
```

## License

MIT
