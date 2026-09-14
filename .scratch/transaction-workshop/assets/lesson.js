(() => {
  document.querySelectorAll("form[data-quiz]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const selected = new FormData(form).get("answer");
      const correct = selected === form.dataset.answer;
      const output = form.querySelector("output");
      output.dataset.correct = String(correct);
      output.textContent = correct ? form.dataset.correct : form.dataset.incorrect;
    });
  });

  document.querySelectorAll("form[data-lab]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const output = form.querySelector("output");
      if (form.dataset.lab === "inventory") {
        const atomic = data.get("executor") === "transaction";
        output.dataset.correct = String(atomic);
        output.textContent = atomic
          ? "BEGIN\nA：可用 5 → 3；预占 0 → 2（尚未提交）\nB：可用 1，小于申请量 2 → 返回库存不足\nROLLBACK\n\n最终读回：A 可用 5、预占 0；B 可用 1、预占 0；流水 0 条。\n整组失败，没有部分预占。"
          : "A：可用 5 → 3；预占 0 → 2；流水 1 条 → 自动提交\nB：可用 1，小于申请量 2 → 返回库存不足\n\n最终读回：A 可用 3、预占 2；B 可用 1、预占 0；流水 1 条。\n整组失败，但 A 的已提交效果仍在。事后调用 ROLLBACK 不能撤销它。";
      } else if (form.dataset.lab === "cart") {
        const quantity = Number(data.get("quantity"));
        const owned = data.get("owner") === "self";
        const command = data.get("implementation") === "command";
        if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
          output.dataset.correct = "false";
          output.textContent = "输入必须是 0 到 999 的整数。";
          return;
        }
        if (!command) {
          output.dataset.correct = "false";
          output.textContent = "请求数量：" + quantity + "\nSQL Quantity：NULL（映射遗漏）\n更新命中：0 行；计数查询仍能返回结果\n\n旧路径可能返回成功，目标条目仍是 2 件。COUNT 不是写入成功的证据。";
        } else if (!owned) {
          output.dataset.correct = "true";
          output.textContent = "按 cart_item_id + 认证用户查找：0 行\n返回统一的条目不可用错误，不透露他人的条目信息\n\n目标条目仍是 2 件，没有写入。";
        } else if (quantity === 0) {
          output.dataset.correct = "true";
          output.textContent = "校验数量 → 选择删除分支 → 命中本人条目 1 行\n在同一事务内查询变更后的统计 → COMMIT\n\n本人原有 1 个条目，现在 0 个；is_cart_empty = true。";
        } else {
          output.dataset.correct = "true";
          output.textContent = "SQL Quantity：" + quantity + "\n按 cart_item_id + 认证用户更新：1 行\n在同一事务内查询统计 → COMMIT\n\n读回条目数量：" + quantity + "；条目数仍是 1，不是 " + quantity + "。";
        }
      }
    });
  });
})();
