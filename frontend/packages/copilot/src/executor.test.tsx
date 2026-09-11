/**
 * 执行器与 DOM 坑位的回归：
 *  - 受控 input 经 setNativeValue 后 React onChange 真的被调用；
 *  - MUI Select 经 mousedown 打开并能点中选项；
 *  - Esc（abort）能在步骤之间停下来。
 * 用真实 MUI 组件而不是 mock：MUI 升级改了触发事件，这里要先红。
 */
import { afterEach, describe, expect, it } from "vite-plus/test";
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MenuItem, Select } from "@mui/material";
import { CopilotAbortError, runSteps, type ExecutorContext } from "./executor";
import { createCopilotStore } from "./store";
import type { Step } from "./types";

afterEach(cleanup);

function ctx(
  overrides: Partial<ExecutorContext> = {},
): ExecutorContext & { controller: AbortController } {
  const controller = new AbortController();
  return {
    controller,
    store: createCopilotStore(),
    navigate: () => undefined,
    signal: controller.signal,
    timeoutMs: 2000,
    reducedMotion: true,
    describe: (s) => s.kind,
    ...overrides,
  };
}

function Form({ onSubmit }: { onSubmit: (v: string) => void }) {
  const [value, setValue] = useState("");
  const [clicks, setClicks] = useState(0);
  return (
    <div>
      <input
        aria-label="kw"
        data-copilot="form.input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit(value)}
      />
      <button type="button" data-copilot="form.button" onClick={() => setClicks((c) => c + 1)}>
        clicks:{clicks}
      </button>
      <output data-testid="value">{value}</output>
    </div>
  );
}

describe("runSteps", () => {
  it("type 触发 React 受控更新，press Enter 触发 onKeyDown，click 触发 onClick", async () => {
    const submitted: string[] = [];
    render(<Form onSubmit={(v) => submitted.push(v)} />);
    const steps: Step[] = [
      { kind: "type", anchor: "form.input", value: "保温杯" },
      { kind: "press", anchor: "form.input", key: "Enter" },
      { kind: "click", anchor: "form.button" },
    ];
    await runSteps(steps, ctx());
    expect(screen.getByTestId("value").textContent).toBe("保温杯");
    expect(submitted).toEqual(["保温杯"]);
    expect(screen.getByText("clicks:1")).toBeTruthy();
  });

  it("select 经 mousedown 打开 MUI Select 并选中选项", async () => {
    function Filter() {
      const [v, setV] = useState("all");
      return (
        <div>
          <Select
            value={v}
            onChange={(e) => setV(e.target.value)}
            inputProps={{ "aria-label": "status" }}
            SelectDisplayProps={
              { "data-copilot": "orders.status-filter" } as React.HTMLAttributes<HTMLDivElement>
            }
          >
            <MenuItem value="all" data-copilot="orders.status-option-all">
              全部
            </MenuItem>
            <MenuItem value="pending" data-copilot="orders.status-option-pending">
              待发货
            </MenuItem>
          </Select>
          <output data-testid="status">{v}</output>
        </div>
      );
    }
    render(<Filter />);
    await runSteps(
      [
        {
          kind: "select",
          anchor: "orders.status-filter",
          optionAnchor: "orders.status-option-pending",
        },
      ],
      ctx(),
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("pending"));
  });

  it("等不到锚点时按超时失败并带上步骤序号", async () => {
    render(<div />);
    await expect(
      runSteps(
        [
          { kind: "say", text: "hi" },
          { kind: "waitFor", anchor: "nope" },
        ],
        ctx({ timeoutMs: 100 }),
      ),
    ).rejects.toMatchObject({ name: "CopilotRunError", index: 1 });
  });

  it("abort 让执行在步骤之间停下并抛 CopilotAbortError", async () => {
    render(<Form onSubmit={() => undefined} />);
    const c = ctx({ reducedMotion: false, typingDelayMs: [20, 20] });
    const run = runSteps(
      [
        { kind: "type", anchor: "form.input", value: "一二三四五六七八九十" },
        { kind: "click", anchor: "form.button" },
      ],
      c,
    );
    setTimeout(() => c.controller.abort(), 60);
    await expect(run).rejects.toBeInstanceOf(CopilotAbortError);
    // 已输入的内容不回滚，但后面的 click 不会执行
    expect(screen.getByTestId("value").textContent?.length).toBeGreaterThan(0);
    expect(screen.getByText("clicks:0")).toBeTruthy();
  });

  it("navigate 走注入的 Router 函数，不碰 location", async () => {
    const visited: string[] = [];
    await runSteps(
      [{ kind: "navigate", path: "/orders" }],
      ctx({ navigate: (p) => void visited.push(p) }),
    );
    expect(visited).toEqual(["/orders"]);
    expect(window.location.pathname).not.toBe("/orders");
  });
});
