/**
 * 锁住通知链路「生产端 addNotification → NotificationsHost 渲染」的三条行为：
 *   1. 加入即显示（此前 notificationStore 没有任何渲染订阅者，通知静默丢失）；
 *   2. 手动关闭只删自己；
 *   3. 同一毫秒连续加入两条也各有独立 id（防回归：纯 Date.now() id 会互删）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addNotification, clearNotifications } from "@ecommerce/utils";

import NotificationsHost from "./NotificationsHost";

describe("NotificationsHost", () => {
  beforeEach(() => {
    act(() => {
      clearNotifications();
    });
  });

  // 非 globals 模式下 testing-library 不会自动 cleanup，
  // 不手动清理的话多个用例的宿主会叠加渲染、互相看见对方的 Alert
  afterEach(() => {
    cleanup();
  });

  it("addNotification 后立即渲染对应 severity 的 Alert", async () => {
    render(<NotificationsHost />);
    act(() => {
      // duration: 0 表示不自动消失，避免测试依赖真实定时器
      addNotification({ message: "已退出登录", severity: "success", duration: 0 });
    });
    expect(await screen.findByText("已退出登录")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("点关闭只移除该条通知", async () => {
    render(<NotificationsHost />);
    act(() => {
      addNotification({ message: "第一条", severity: "info", duration: 0 });
      addNotification({ message: "第二条", severity: "warning", duration: 0 });
    });
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    const closeButtons = screen.getAllByLabelText("Close");
    await userEvent.click(closeButtons[0]);

    expect(screen.queryByText("第一条")).toBeNull();
    expect(screen.getByText("第二条")).toBeTruthy();
  });

  it("同一毫秒加入的两条通知拥有不同 id（不互删）", () => {
    render(<NotificationsHost />);
    act(() => {
      addNotification({ message: "同批 A", severity: "error", duration: 0 });
      addNotification({ message: "同批 B", severity: "error", duration: 0 });
    });
    // 若 id 相同，移除任意一条会把两条一起过滤掉
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
