/**
 * 聊天面板：右下角浮动，含消息、示例、界面模式开关、停止 / 确认按钮、aria-live 步骤播报。
 * 样式沿用灯市 token（纸底、竹线、朱砂动作）。
 */
import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  InputBase,
  Paper,
  Switch,
  Typography,
} from "@mui/material";
import { Send, Sparkles, Square, X } from "@ecommerce/icons";
import { useTranslation } from "@ecommerce/i18n";
import { useStore } from "zustand";
import { LANTERN } from "./CopilotOverlay";
import type { CopilotApi } from "./CopilotProvider";
import { COPILOT_NS } from "./locales";
import { examplesFor } from "./matcher";

// 高于 MUI 的一切（Modal 1300 / Tooltip 1500）。dev 里 TanStack devtools 的悬浮钮也是 fixed 右下角
// 且 z-index 到 100000，不跟它比大小，各 app 把 devtools 挪到左下（见 consumer bootstrap.tsx / __root.tsx）。
const Z_PANEL = 1500;

export function CopilotPanel({ api }: { api: CopilotApi }) {
  const { store, role, submit, abort } = api;
  const { t } = useTranslation(COPILOT_NS);
  const open = useStore(store, (s) => s.open);
  const uiMode = useStore(store, (s) => s.uiMode);
  const messages = useStore(store, (s) => s.messages);
  const status = useStore(store, (s) => s.status);
  const currentStep = useStore(store, (s) => s.currentStep);
  const pendingConfirm = useStore(store, (s) => s.pendingConfirm);
  const actions = useStore(store, (s) => s.actions);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, currentStep?.index]);

  const running = status !== "idle";
  const examples = examplesFor(actions, role);

  const send = (text: string) => {
    if (!text.trim() || running) return;
    setDraft("");
    void submit(text);
  };

  if (!open) {
    return (
      <IconButton
        data-copilot-ui="fab"
        aria-label={t("open")}
        onClick={() => store.getState().setOpen(true)}
        sx={{
          position: "fixed",
          right: 24,
          bottom: 24,
          zIndex: Z_PANEL,
          width: 52,
          height: 52,
          bgcolor: LANTERN.vermilion,
          color: LANTERN.paper,
          boxShadow: "0 8px 20px rgba(194, 55, 43, 0.35)",
          "&:hover": { bgcolor: LANTERN.vermilionDeep },
        }}
      >
        <Sparkles size={24} />
      </IconButton>
    );
  }

  return (
    <Paper
      data-copilot-ui="panel"
      role="dialog"
      aria-label={t("title")}
      elevation={0}
      sx={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: Z_PANEL,
        width: 360,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: LANTERN.paper,
        border: `1px solid ${LANTERN.bamboo}`,
        borderRadius: "12px",
        boxShadow: "0 16px 40px rgba(42, 42, 40, 0.18)",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 1,
          borderBottom: `1px solid ${LANTERN.bamboo}`,
        }}
      >
        <Box sx={{ color: LANTERN.vermilion, display: "flex" }}>
          <Sparkles size={18} />
        </Box>
        <Typography
          component="h2"
          variant="subtitle1"
          sx={{ fontWeight: 700, color: LANTERN.ink, flex: 1 }}
        >
          {t("title")}
        </Typography>
        <FormControlLabel
          sx={{ mr: 0, "& .MuiFormControlLabel-label": { fontSize: 12, color: LANTERN.ink } }}
          label={t("uiMode")}
          control={
            <Switch
              size="small"
              checked={uiMode}
              onChange={(e) => store.getState().setUiMode(e.target.checked)}
              slotProps={{
                input: {
                  "data-copilot-ui": "ui-mode",
                } as React.InputHTMLAttributes<HTMLInputElement>,
              }}
            />
          }
        />
        <IconButton
          size="small"
          aria-label={t("close")}
          onClick={() => store.getState().setOpen(false)}
        >
          <X size={16} />
        </IconButton>
      </Box>

      <Box
        ref={listRef}
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 1.5,
          py: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {messages.length === 0 && examples.length > 0 && (
          <Box>
            <Typography variant="body2" sx={{ color: LANTERN.ink, mb: 1 }}>
              {t("hint")}
            </Typography>
            <ExampleChips examples={examples} onPick={send} />
          </Box>
        )}
        {messages.map((m) => (
          <Box
            key={m.id}
            data-copilot-ui="message"
            data-from={m.from}
            sx={{
              alignSelf: m.from === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%",
              px: 1.5,
              py: 1,
              borderRadius: m.from === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              bgcolor: m.from === "user" ? LANTERN.vermilion : "#FFFFFF",
              color: m.from === "user" ? LANTERN.paper : LANTERN.ink,
              border: m.from === "user" ? "none" : `1px solid ${LANTERN.bamboo}`,
              fontSize: 14,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.text}
            {m.examples && m.examples.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <ExampleChips examples={m.examples} onPick={send} />
              </Box>
            )}
          </Box>
        ))}
        {pendingConfirm && (
          <Box
            data-copilot-ui="confirm"
            sx={{
              p: 1.5,
              border: `1px solid ${LANTERN.vermilion}`,
              borderRadius: "8px",
              bgcolor: "#FFF7E0",
            }}
          >
            <Typography variant="body2" sx={{ color: LANTERN.ink, mb: 1 }}>
              {pendingConfirm.text}
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="contained"
                onClick={() => pendingConfirm.resolve(true)}
                sx={{ bgcolor: LANTERN.vermilion }}
              >
                {t("continue")}
              </Button>
              <Button
                size="small"
                onClick={() => pendingConfirm.resolve(false)}
                sx={{ color: LANTERN.ink }}
              >
                {t("cancel")}
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* 步骤播报：读屏用 polite，视觉上也显示在输入区上方 */}
      <Box
        data-copilot-ui="step"
        aria-live="polite"
        sx={{
          minHeight: running ? 32 : 0,
          px: 1.5,
          py: running ? 0.5 : 0,
          fontSize: 12,
          color: LANTERN.ink,
          bgcolor: "#FFF7E0",
          borderTop: running ? `1px solid ${LANTERN.bamboo}` : "none",
          display: "flex",
          alignItems: "center",
          gap: 1,
          transition: "min-height 160ms ease",
        }}
      >
        {running && currentStep && (
          <>
            <Box component="span" sx={{ color: LANTERN.vermilion, fontWeight: 700, flexShrink: 0 }}>
              {t("stepProgress", { index: currentStep.index + 1, total: currentStep.total })}
            </Box>
            <Box
              component="span"
              sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {currentStep.text}
            </Box>
          </>
        )}
      </Box>

      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 1,
          borderTop: `1px solid ${LANTERN.bamboo}`,
        }}
      >
        <InputBase
          inputProps={{ "aria-label": t("placeholder"), "data-copilot-ui": "input" }}
          placeholder={t("placeholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={running}
          sx={{
            flex: 1,
            px: 1.5,
            py: 0.5,
            fontSize: 14,
            bgcolor: "#FFFFFF",
            border: `1px solid ${LANTERN.bamboo}`,
            borderRadius: "8px",
            "&.Mui-focused": {
              borderColor: LANTERN.vermilion,
              boxShadow: "0 0 0 3px rgba(194, 55, 43, 0.14)",
            },
          }}
        />
        {running ? (
          <IconButton
            data-copilot-ui="stop"
            aria-label={t("stop")}
            onClick={abort}
            sx={{ color: LANTERN.vermilion }}
          >
            <Square size={18} />
          </IconButton>
        ) : (
          <IconButton
            data-copilot-ui="send"
            type="submit"
            aria-label={t("send")}
            disabled={!draft.trim()}
            sx={{ color: LANTERN.vermilion }}
          >
            <Send size={18} />
          </IconButton>
        )}
      </Box>
    </Paper>
  );
}

function ExampleChips({
  examples,
  onPick,
}: {
  examples: string[];
  onPick: (text: string) => void;
}) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      {examples.map((ex) => (
        <Chip
          key={ex}
          data-copilot-ui="example"
          label={ex}
          size="small"
          onClick={() => onPick(ex)}
          sx={{
            bgcolor: "#FFFFFF",
            border: `1px solid ${LANTERN.bamboo}`,
            color: LANTERN.ink,
            "&:hover": { borderColor: LANTERN.vermilion, bgcolor: "#FFF7E0" },
          }}
        />
      ))}
    </Box>
  );
}
