import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DiffEditor } from "@monaco-editor/react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { configApi, ConfigFormat } from "@/api";
import { formatToLanguage } from "@/lib/format";
import { glassPanel, sp } from "@/styles/glass";

const SearchSchema = z.object({
  ns: z.string().default("ecommerce"),
  env: z.string().default("dev"),
  key: z.string(),
});

export const Route = createFileRoute("/history")({
  component: HistoryPage,
  validateSearch: SearchSchema,
});

function fmtTime(ts?: { seconds: bigint; nanos: number }): string {
  if (!ts) return "";
  return new Date(Number(ts.seconds) * 1000).toLocaleString();
}

function HistoryPage() {
  const { ns, env, key } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);

  const current = useQuery({
    queryKey: ["getKey", ns, env, key],
    queryFn: ({ signal }) => configApi.getKey(ns, env, key, signal),
    retry: false,
  });

  const revisions = useQuery({
    queryKey: ["listRevisions", ns, env, key],
    queryFn: ({ signal }) => configApi.listRevisions(ns, env, key, signal),
    retry: false,
  });

  // 默认选中次新版本(与当前对比)
  useEffect(() => {
    const revs = revisions.data?.revisions ?? [];
    if (selected === null && revs.length > 0) {
      setSelected(revs.length > 1 ? revs[1].version : revs[0].version);
    }
  }, [revisions.data, selected]);

  const rollback = useMutation({
    mutationFn: (version: number) => configApi.rollback(ns, env, key, version, `rollback to v${version}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["getKey", ns, env, key] });
      qc.invalidateQueries({ queryKey: ["listRevisions", ns, env, key] });
      qc.invalidateQueries({ queryKey: ["listKeys"] });
      navigate({ to: "/edit", search: { ns, env, key } });
    },
  });

  const entry = current.data?.entry;
  const revs = revisions.data?.revisions ?? [];
  const selectedRev = revs.find((r) => r.version === selected);
  const language = formatToLanguage(entry?.format ?? ConfigFormat.YAML);

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", display: "flex", flexDirection: "column", gap: sp[3] }}>
      <Card sx={{ p: sp[4] }}>
        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: sp[2] }}>
          <Button
            startIcon={<ArrowLeft size={18} />}
            onClick={() => navigate({ to: "/edit", search: { ns, env, key } })}
          >
            返回编辑
          </Button>
          <Typography sx={{ fontFamily: "monospace", fontWeight: 700 }}>{key}</Typography>
          <Chip label={`${ns}/${env}`} size="small" variant="outlined" />
          {entry && <Chip label={`当前 v${entry.version}`} size="small" />}
        </Box>
      </Card>

      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: sp[3], alignItems: "stretch" }}>
        {/* 版本列表 */}
        <Card sx={{ width: { md: 320 }, flexShrink: 0 }}>
          <Box sx={{ p: sp[3] }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              版本历史
            </Typography>
          </Box>
          <Divider />
          {revisions.isLoading ? (
            <Box sx={{ p: sp[4], textAlign: "center" }}>
              <CircularProgress size={20} />
            </Box>
          ) : revs.length === 0 ? (
            <Box sx={{ p: sp[4] }}>
              <Typography color="text.secondary">暂无历史。</Typography>
            </Box>
          ) : (
            <List disablePadding sx={{ maxHeight: "60vh", overflow: "auto" }}>
              {revs.map((r) => (
                <ListItemButton
                  key={r.version}
                  selected={r.version === selected}
                  onClick={() => setSelected(r.version)}
                  sx={{ px: sp[3] }}
                >
                  <ListItemText
                    primary={`v${r.version}${entry && r.version === entry.version ? " · 当前" : ""}`}
                    secondary={`${r.author || "—"} · ${fmtTime(r.createdAt)}${r.comment ? " · " + r.comment : ""}`}
                  />
                  <Button
                    size="small"
                    startIcon={<RotateCcw size={14} />}
                    disabled={rollback.isPending || (entry && r.version === entry.version)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      rollback.mutate(r.version);
                    }}
                  >
                    回滚
                  </Button>
                </ListItemButton>
              ))}
            </List>
          )}
        </Card>

        {/* Diff:选中版本(左) vs 当前(右) */}
        <Card sx={{ flex: 1, p: sp[1] }}>
          {rollback.isError && (
            <Alert severity="error" sx={{ m: sp[2] }}>
              回滚失败:{String((rollback.error as Error)?.message ?? rollback.error)}
            </Alert>
          )}
          <Box sx={{ px: sp[3], py: sp[2] }}>
            <Typography variant="body2" color="text.secondary">
              左:v{selectedRev?.version ?? "—"}　→　右:当前 v{entry?.version ?? "—"}
            </Typography>
          </Box>
          <Box sx={{ ...glassPanel, background: "rgba(255,255,255,0.85)", borderRadius: "12px", overflow: "hidden" }}>
            <DiffEditor
              height="58vh"
              language={language}
              original={selectedRev?.value ?? ""}
              modified={entry?.value ?? ""}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                renderSideBySide: true,
                readOnly: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </Box>
        </Card>
      </Box>
    </Box>
  );
}
