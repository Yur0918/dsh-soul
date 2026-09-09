/**
 * DSH 运行时适配层 —— agent.inject 绑定（bridge/inject.ts）
 *
 * ⚠️ 仅接口声明 + 注释，**不产生任何真实 DSH 调用**。
 *
 * v2 语义（沿用 v1 + md）：
 *  - 配置变更/保存后通过 agent.inject 热同步（dirty 检测：无变化不注入）；
 *  - 注入内容为快照（source.kind=plugin, plugin=dsh-soul, form=snapshot）；
 *  - 注入不主动触发请求：**下一次请求生效**（UI 明示）。
 *
 * 目标契约（待验证）：
 *   agent.inject(createUserMessage({ text, source:{kind:'plugin',plugin:'dsh-soul',form:'snapshot'} }))
 *   createUserMessage 与 source 结构以 spike 验证为准。
 */
import { SECTION_ORDER, SECTION_NAMES } from '../prompt/sections';
import type { CompiledPrompt } from '../prompt/compilePrompt';

export interface InjectionPoint {
  tool: string;
  order: number;
  text: string;
}

/**
 * 纯计算：编译产物 → 注入点列表（骨架可直测；真实注入由宿主实现）。
 * memory 段仅在非空时生成注入点（inject=false 天然无点）。
 */
export function buildInjectionPoints(prompt: CompiledPrompt): InjectionPoint[] {
  const points: InjectionPoint[] = [];
  if (prompt.persona) {
    points.push({ tool: SECTION_NAMES.persona, order: SECTION_ORDER.persona, text: prompt.persona });
  }
  if (prompt.memory) {
    points.push({ tool: SECTION_NAMES.memory, order: SECTION_ORDER.memory, text: prompt.memory });
  }
  return points;
}

/** 宿主侧注入绑定接口声明（真实实现不在本骨架中） */
export interface InjectBinding {
  /**
   * 注入快照消息。
   * 宿主实现参考：
   *   agent.inject(createUserMessage({ text: point.text, source: {kind:'plugin', plugin:'dsh-soul', form:'snapshot'} }));
   */
  inject(point: InjectionPoint): Promise<void>;
  /** dirty 检测：内容与上次注入一致时跳过（沿用 v1 无变化不注入） */
  isDirty(incoming: InjectionPoint, last: InjectionPoint | null): boolean;
}

/** 占位实现（no-op + 纯 dirty 比较） */
export function createInjectBindingStub(): InjectBinding {
  let last: InjectionPoint | null = null;
  return {
    inject: async (point: InjectionPoint) => {
      last = point;
    },
    isDirty: (incoming: InjectionPoint, prev: InjectionPoint | null): boolean => {
      if (!prev) return true;
      return incoming.text !== prev.text || incoming.order !== prev.order;
    },
  };
}
