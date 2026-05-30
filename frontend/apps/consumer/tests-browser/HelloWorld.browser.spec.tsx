import { expect, test, afterEach } from "vite-plus/test";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HelloWorld from "../src/examples/test/HelloWorld";

// 在每个测试后清理 DOM
afterEach(() => {
  cleanup();
});

test("renders name in browser", async () => {
  // 在浏览器环境中渲染组件
  render(<HelloWorld name="Playwright" />);

  // 验证初始渲染
  expect(screen.getByText("Hello Playwright x1!")).toBeDefined();

  // 模拟用户交互
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Increment" }));

  // 验证交互后的状态
  expect(screen.getByText("Hello Playwright x2!")).toBeDefined();
});

test("multiple increments work correctly", async () => {
  render(<HelloWorld name="Browser" />);

  const user = userEvent.setup();

  // 点击按钮多次
  await user.click(screen.getByRole("button", { name: "Increment" }));
  await user.click(screen.getByRole("button", { name: "Increment" }));
  await user.click(screen.getByRole("button", { name: "Increment" }));

  expect(screen.getByText("Hello Browser x4!")).toBeDefined();
});
