import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import Editor from "@monaco-editor/react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { ConnectError, Code } from "@connectrpc/connect";
import { History, Save, Trash2 } from "lucide-react";
import { configApi, ConfigFormat } from "@/api";
import { FORMAT_OPTIONS, formatLabel, formatToLanguage } from "@/lib/format";
import { glassPanel, sp } from "@/styles/glass";

const SearchSchema = z.object({
  ns: z.string().default("ecommerce"),
  env: z.string().default("dev"),
  key: z.string(),
});

export const Route = createFileRoute("/edit")({
  component: EditPage,
  validateSearch: SearchSchema,
});

function EditPage() {
  const { ns, env, key } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [value, setValue] = useState("");
  const [format, setFormat] = useState<ConfigFormat>(ConfigFormat.YAML);
  const [isSecret, setIsSecret] = useState(false);
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["getKey", ns, env, key],
    queryFn: async ({ signal }) => {
      try {
        return await configApi.getKey(ns, env, key, signal);
      } catch (e) {
        // 新建 key:后端返回 NotFound,视为空白新条目
        if (ConnectError.from(e).code === Code.NotFound) return null;
        throw e;
      }
    },
    retry: false,
  });

  // 首次加载后回填表单
  useEffect(() => {
    if (data === undefined) return;
    if (data === null || !data.entry) {
      setIsNew(true);
      return;
    }
    const e = data.entry;
    setIsNew(false);
    setValue(e.value);
    setFormat(e.format === ConfigFormat.UNSPECIFIED ? ConfigFormat.YAML : e.format);
    setIsSecret(e.isSecret);
    setDescription(e.description);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      configApi.putKey({ namespace: ns, environment: env, key, format, value, comment, isSecret, description }),
    onSuccess: (res) => {
      setSaveError(null);
      setComment("");
      clearMarkers();
      qc.invalidateQueries({ queryKey: ["getKey", ns, env, key] });
      qc.invalidateQueries({ queryKey: ["listKeys"] });
      // 新建 key 可能引入新的 namespace/environment,刷新下拉数据源
      qc.invalidateQueries({ queryKey: ["listNamespaces"] });
      if (res.entry) setIsNew(false);
    },
    onError: (e) => {
      const ce = ConnectError.from(e);
      setSaveError(ce.rawMessage || ce.message);
      // 将服务端语法校验错误标注到编辑器首行
      if (ce.code === Code.InvalidArgument) setErrorMarker(ce.rawMessage || ce.message);
    },
  });

  const del = useMutation({
    mutationFn: () => configApi.deleteKey(ns, env, key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listKeys"] });
      // 删掉最后一个 key 时 namespace/environment 也会随之消失
      qc.invalidateQueries({ queryKey: ["listNamespaces"] });
      navigate({ to: "/" });
    },
  });

  function clearMarkers() {
    const m = monacoRef.current;
    const ed = editorRef.current;
    if (m && ed?.getModel()) m.editor.setModelMarkers(ed.getModel(), "server", []);
  }
  function setErrorMarker(message: string) {
    const m = monacoRef.current;
    const ed = editorRef.current;
    if (!m || !ed?.getModel()) return;
    m.editor.setModelMarkers(ed.getModel(), "server", [
      {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 200,
        message,
        severity: m.MarkerSeverity.Error,
      },
    ]);
  }

  if (isLoading) {
    return (
      <Box sx={{ p: sp[8], textAlign: "center" }}>
        <CircularProgress />
      </Box>
    );
  }
  if (isError) {
    return (
      <Box sx={{ maxWidth: 900, mx: "auto" }}>
        <Alert severity="error">加载失败:{String((error as Error)?.message ?? error)}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1080, mx: "auto", display: "flex", flexDirection: "column", gap: sp[3] }}>
      {/* 头部:key + 操作 */}
      <Card sx={{ p: sp[4] }}>
        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: sp[2] }}>
          <Typography sx={{ fontFamily: "monospace", fontWeight: 700 }}>{key}</Typography>
          <Chip label={`${ns}/${env}`} size="small" variant="outlined" />
          {isNew ? (
            <Chip label="新建" size="small" color="info" />
          ) : (
            <Chip label={`v${data?.entry?.version ?? "?"}`} size="small" />
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            startIcon={<History size={18} />}
            disabled={isNew}
            onClick={() => navigate({ to: "/history", search: { ns, env, key } })}
          >
            历史
          </Button>
          <Button
            color="error"
            startIcon={<Trash2 size={18} />}
            disabled={isNew || del.isPending}
            onClick={() => del.mutate()}
          >
            删除
          </Button>
          <Button
            variant="contained"
            startIcon={<Save size={18} />}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "保存中…" : "保存"}
          </Button>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            gap: sp[3],
            mt: sp[3],
            alignItems: "center",
          }}
        >
          <TextField
            select
            label="格式"
            size="small"
            value={format}
            onChange={(e) => setFormat(Number(e.target.value) as ConfigFormat)}
            sx={{ minWidth: 140 }}
          >
            {FORMAT_OPTIONS.map((f) => (
              <MenuItem key={f} value={f}>
                {formatLabel(f)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="说明"
            size="small"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ flex: 1, minWidth: 180 }}
          />
          <TextField
            label="变更备注"
            size="small"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            sx={{ flex: 1, minWidth: 180 }}
          />
          <FormControlLabel
            control={<Switch checked={isSecret} onChange={(e) => setIsSecret(e.target.checked)} />}
            label="密钥"
          />
        </Box>
      </Card>

      {saveError && (
        <Alert severity="error" onClose={() => setSaveError(null)}>
          保存失败:{saveError}
        </Alert>
      )}
      {isSecret && !isNew && data?.entry?.value === "******" && (
        <Alert severity="warning">该项为密钥,值已脱敏显示为 ****** ;直接保存会覆盖真实值。</Alert>
      )}

      {/* Monaco 编辑器 */}
      <Card sx={{ p: sp[1], overflow: "hidden" }}>
        <Box sx={{ ...glassPanel, background: "rgba(255,255,255,0.85)", borderRadius: "12px", overflow: "hidden" }}>
          <Editor
            height="60vh"
            language={formatToLanguage(format)}
            value={value}
            onChange={(v) => setValue(v ?? "")}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              monacoRef.current = monaco;
            }}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              tabSize: 2,
              automaticLayout: true,
            }}
          />
        </Box>
      </Card>
    </Box>
  );
}
