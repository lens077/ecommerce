import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useSnapshot } from "valtio";
import { useState } from "react";
import {
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { KeyRound, Plus, RefreshCw } from "lucide-react";
import { configApi, ConfigFormat } from "@/api";
import { editorStore, setEnvironment, setNamespace } from "@/store/editor";
import { ENV_OPTIONS, FORMAT_OPTIONS, formatLabel } from "@/lib/format";
import { sp } from "@/styles/glass";

export const Route = createFileRoute("/")({
  component: BrowserPage,
});

function BrowserPage() {
  const snap = useSnapshot(editorStore);
  const navigate = useNavigate();
  const [prefix, setPrefix] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["listKeys", snap.namespace, snap.environment, prefix],
    queryFn: ({ signal }) => configApi.listKeys(snap.namespace, snap.environment, prefix, signal),
  });

  const openKey = (key: string) => {
    navigate({ to: "/edit", search: { ns: snap.namespace, env: snap.environment, key } });
  };

  return (
    <Box sx={{ maxWidth: 1080, mx: "auto", display: "flex", flexDirection: "column", gap: sp[4] }}>
      {/* 顶部:命名空间 / 环境 / 搜索 */}
      <Card sx={{ p: sp[4] }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: sp[3] }}>
          <TextField
            label="命名空间"
            size="small"
            value={snap.namespace}
            onChange={(e) => setNamespace(e.target.value)}
            sx={{ minWidth: 160 }}
          />
          <TextField
            select
            label="环境"
            size="small"
            value={snap.environment}
            onChange={(e) => setEnvironment(e.target.value)}
            sx={{ minWidth: 120 }}
          >
            {ENV_OPTIONS.map((e) => (
              <MenuItem key={e} value={e}>
                {e}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="按 key 前缀过滤"
            size="small"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <Tooltip title="刷新">
            <IconButton onClick={() => refetch()}>
              <RefreshCw size={18} />
            </IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setNewOpen(true)}>
            新建 Key
          </Button>
        </Box>
      </Card>

      {/* key 列表 */}
      <Card>
        <Box sx={{ p: sp[4], pb: sp[2] }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {snap.namespace} / {snap.environment}
            {isFetching && <CircularProgress size={14} sx={{ ml: sp[2] }} />}
          </Typography>
        </Box>
        <Divider />
        {isLoading ? (
          <Box sx={{ p: sp[6], textAlign: "center" }}>
            <CircularProgress />
          </Box>
        ) : isError ? (
          <Box sx={{ p: sp[4] }}>
            <Typography color="error">加载失败:{String((error as Error)?.message ?? error)}</Typography>
          </Box>
        ) : !data || data.entries.length === 0 ? (
          <Box sx={{ p: sp[6], textAlign: "center" }}>
            <Typography color="text.secondary">暂无配置项,点击「新建 Key」创建。</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {data.entries.map((e) => (
              <ListItemButton key={e.key} onClick={() => openKey(e.key)} sx={{ px: sp[4] }}>
                <KeyRound size={16} style={{ marginRight: 12, opacity: 0.6 }} />
                <ListItemText
                  primary={<Box component="span" sx={{ fontFamily: "monospace" }}>{e.key}</Box>}
                  secondary={`v${e.version} · ${e.updatedBy || "—"}`}
                />
                <Box sx={{ display: "flex", alignItems: "center", gap: sp[1] }}>
                  {e.isSecret && <Chip label="secret" size="small" color="warning" variant="outlined" />}
                  <Chip label={formatLabel(e.format)} size="small" variant="outlined" />
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}
      </Card>

      <NewKeyDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={(key) => {
          setNewOpen(false);
          openKey(key);
        }}
      />
    </Box>
  );
}

function NewKeyDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (key: string) => void;
}) {
  const [key, setKey] = useState("");
  const [format, setFormat] = useState<ConfigFormat>(ConfigFormat.YAML);

  return (
    <Dialog open={open} onClose={onClose} slotProps={{ paper: { sx: { minWidth: 420 } } }}>
      <DialogTitle>新建配置 Key</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: sp[3], mt: sp[1] }}>
          <TextField
            label="Key(层级路径,如 gateway/config.yaml)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            fullWidth
            autoFocus
          />
          <TextField
            select
            label="格式"
            value={format}
            onChange={(e) => setFormat(Number(e.target.value) as ConfigFormat)}
          >
            {FORMAT_OPTIONS.map((f) => (
              <MenuItem key={f} value={f}>
                {formatLabel(f)}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" disabled={!key.trim()} onClick={() => onCreate(key.trim())}>
          创建并编辑
        </Button>
      </DialogActions>
    </Dialog>
  );
}
