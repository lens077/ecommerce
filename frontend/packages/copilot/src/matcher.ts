/**
 * 意图匹配（设计 §4.3）：只在当前角色允许的动作里试；动作按注册顺序、正则按数组顺序，
 * 首个命中胜出。命名捕获组为空或只有空白视为未命中，继续试下一条。
 */
import { normalizeInput } from "./normalize";
import type { CopilotAction, CopilotParams, CopilotRole, IntentMatch } from "./types";

export function matchIntent(
  actions: readonly CopilotAction[],
  role: CopilotRole,
  rawInput: string,
): IntentMatch | null {
  const input = normalizeInput(rawInput);
  if (!input) return null;
  for (const action of actions) {
    if (!action.roles.includes(role)) continue;
    for (const pattern of action.patterns) {
      // 正则可能带 g 标志被复用，先归零 lastIndex
      pattern.lastIndex = 0;
      const m = pattern.exec(input);
      if (!m) continue;
      const params = extractParams(m);
      if (params === null) continue;
      return { action, params };
    }
  }
  return null;
}

/** 命名捕获组全部非空才算命中；没有命名组的正则返回空参数 */
function extractParams(m: RegExpExecArray): CopilotParams | null {
  const groups = m.groups ?? {};
  const params: CopilotParams = {};
  for (const [key, value] of Object.entries(groups)) {
    const v = (value ?? "").trim();
    if (!v) return null;
    params[key] = v;
  }
  return params;
}

/** 当前角色可用动作的示例，给「未命中」与面板提示用 */
export function examplesFor(actions: readonly CopilotAction[], role: CopilotRole): string[] {
  return actions.filter((a) => a.roles.includes(role)).flatMap((a) => a.examples);
}
