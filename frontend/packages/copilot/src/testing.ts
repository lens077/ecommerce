/**
 * 给各 app 的单测用：断言每个动作的 examples 全部命中自己，且不误命中同角色的其他动作
 * （设计 §4.3 的固定断言）。返回问题列表，空数组即通过——不依赖测试框架。
 */
import { matchIntent } from "./matcher";
import type { CopilotAction } from "./types";

export function checkActionExamples(actions: readonly CopilotAction[]): string[] {
  const problems: string[] = [];
  for (const action of actions) {
    if (!/^[a-z][a-z0-9_]{2,40}$/.test(action.name)) {
      problems.push(`${action.name}: 名称不符合 ^[a-z][a-z0-9_]{2,40}$`);
    }
    if (action.examples.length === 0) problems.push(`${action.name}: 没有 examples`);
    for (const role of action.roles) {
      for (const ex of action.examples) {
        const m = matchIntent(actions, role, ex);
        if (!m) problems.push(`${action.name}: 「${ex}」未命中任何动作`);
        else if (m.action !== action)
          problems.push(`${action.name}: 「${ex}」误命中 ${m.action.name}`);
      }
    }
  }
  return problems;
}
