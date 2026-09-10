import { describe, expect, it } from "vite-plus/test";
import { examplesFor, matchIntent } from "./matcher";
import { normalizeInput } from "./normalize";
import { checkActionExamples } from "./testing";
import type { CopilotAction } from "./types";

const search: CopilotAction = {
  name: "search_products",
  roles: ["customer"],
  patterns: [/^(?:帮我|请)?(?:查|搜|找)(?:一下)?(?<keyword>.+?)(?:商品)?$/],
  examples: ["帮我查保温杯", "搜一下保温杯商品"],
  plan: () => [],
};

const monitor: CopilotAction = {
  name: "open_monitor",
  roles: ["admin"],
  patterns: [/^(?:帮我|请)?(?:查看|打开|看看)监控$/],
  examples: ["帮我查看监控"],
  plan: () => [],
};

describe("normalizeInput", () => {
  it("去首尾空白、全角标点、成对引号、句末标点，并转小写", () => {
    expect(normalizeInput("  帮我查「保温杯」！ ")).toBe("帮我查保温杯");
    expect(normalizeInput("查 iPhone 15？")).toBe("查 iphone 15");
    expect(normalizeInput("“帮我查”保温杯。")).toBe("帮我查保温杯");
  });

  it("单边引号不是成对的，保留", () => {
    expect(normalizeInput("查「保温杯")).toBe("查「保温杯");
  });
});

describe("matchIntent", () => {
  it("命名捕获组变成参数", () => {
    const m = matchIntent([search], "customer", "帮我查「保温杯」商品");
    expect(m?.action.name).toBe("search_products");
    expect(m?.params).toEqual({ keyword: "保温杯" });
  });

  it("只在当前角色允许的动作里匹配", () => {
    expect(matchIntent([search, monitor], "customer", "打开监控")).toBeNull();
    expect(matchIntent([search, monitor], "admin", "打开监控")?.action.name).toBe("open_monitor");
    expect(matchIntent([search, monitor], "admin", "帮我查保温杯")).toBeNull();
  });

  it("捕获组为空视为未命中", () => {
    expect(matchIntent([search], "customer", "帮我查")).toBeNull();
    expect(matchIntent([search], "customer", "   ")).toBeNull();
  });

  it("examplesFor 只列当前角色的示例", () => {
    expect(examplesFor([search, monitor], "admin")).toEqual(["帮我查看监控"]);
  });
});

describe("checkActionExamples", () => {
  it("样例全命中且不互相误命中时返回空", () => {
    expect(checkActionExamples([search, monitor])).toEqual([]);
  });

  it("样例被同角色的另一个动作先抢走时报错", () => {
    const greedy: CopilotAction = { ...monitor, name: "greedy", patterns: [/^.+$/] };
    const problems = checkActionExamples([greedy, monitor]);
    expect(problems.some((p) => p.includes("误命中 greedy"))).toBe(true);
  });
});
