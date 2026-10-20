# 2.1.1（2026-10-20）

## 兼容

- 声明 `engines.dsh: ">=0.1.1-rc.2 <0.3.0"`。DSH 0.2.1 起插件兼容性优先按该字段判定（声明即单独裁决，忽略 peer 规则），
  不声明只能靠兜底规则被判兼容，出问题没有前置拦截。
- 已在 `0.2.1-rc.2` 实机验证：`/dsh-soul/{config,prompt,personas,audit}` 四个端点全 200，prompt sections
  （persona@0.1 / memory@0.5）与 `/soul` 命令正常注册，vitest 87/87、tsc 零错。

## 说明

- 无运行时行为变化；本版为打包/兼容声明版本。
