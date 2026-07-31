import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  IconButton,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ConnectError, Code } from "@connectrpc/connect";
import { toAppError } from "@ecommerce/api";
import { CheckCircle2, History, Maximize2, Minimize2, Save, Trash2, Wand2, XCircle } from "lucide-react";
import { configApi, ConfigFormat } from "@/api";
import { FORMAT_OPTIONS, formatLabel, formatToLanguage } from "@/lib/format";
import {
  canFormat,
  FormatError,
  formatContent,
  type FormatIssue,
  validateContent,
  VALID,
} from "@/lib/validate";
import { fullscreenOverlay, glassPanel, sp } from "@/styles/glass";

const SearchSchema = z.object({
  ns: z.string().default("ecommerce"),
  env: z.string().default("dev"),
  key: z.string(),
});

export const Route = createFileRoute("/edit")({
  component: EditPage,
  validateSearch: SearchSchema,
});

/** Monaco marker 的 owner。格式校验和服务端报错各占一个,互不覆盖。 */
const MARKER_FORMAT = "config-format";
const MARKER_SERVER = "server";

/** 边打字边解析的防抖窗口 */
const VALIDATE_DEBOUNCE_MS = 300;

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
  const [check, setCheck] = useState(VALID);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // ------------------------------------------------------------ 标注

  const applyMarkers = useCallback((owner: string, issues: FormatIssue[]) => {
    const m = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!m || !model) return;
    m.editor.setModelMarkers(
      model,
      owner,
      issues.map((i) => ({
        startLineNumber: i.line,
        startColumn: i.column,
        endLineNumber: i.endLine,
        endColumn: i.endColumn,
        message: i.message,
        severity: m.MarkerSeverity.Error,
      })),
    );
  }, []);

  // ------------------------------------------------------------ 实时校验

  // 边打字边按「下拉里选的格式」解析。防抖是为了不在每个按键上都跑一遍解析器。
  useEffect(() => {
    const timer = setTimeout(() => {
      const result = validateContent(value, format);
      setCheck(result);
      applyMarkers(MARKER_FORMAT, result.issues);
    }, VALIDATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, format, applyMarkers]);

  // ------------------------------------------------------------ 格式化

  const doFormat = useCallback(() => {
    if (!canFormat(format)) return;
    try {
      const formatted = formatContent(value, format);
      if (formatted !== value) setValue(formatted);
      setCheck(VALID);
      applyMarkers(MARKER_FORMAT, []);
      applyMarkers(MARKER_SERVER, []);
    } catch (e) {
      // 格式化失败只可能是因为解析不过,复用同一套错误展示
      if (e instanceof FormatError) {
        setCheck({ ok: false, issues: e.issues });
        applyMarkers(MARKER_FORMAT, e.issues);
      }
    }
  }, [value, format, applyMarkers]);

  // Monaco 的快捷键回调只在 onMount 时注册一次,拿不到后续的 state,所以过 ref
  const doFormatRef = useRef(doFormat);
  doFormatRef.current = doFormat;

  /** 点错误 chip 跳到出错的位置 */
  const revealIssue = (issue: FormatIssue) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.revealLineInCenter(issue.line);
    ed.setPosition({ lineNumber: issue.line, column: issue.column });
    ed.focus();
  };

  // ------------------------------------------------------------ 保存/删除

  const save = useMutation({
    mutationFn: () =>
      configApi.putKey({ namespace: ns, environment: env, key, format, value, comment, isSecret, description }),
    onSuccess: (res) => {
      setSaveError(null);
      setComment("");
      applyMarkers(MARKER_SERVER, []);
      qc.invalidateQueries({ queryKey: ["getKey", ns, env, key] });
      qc.invalidateQueries({ queryKey: ["listKeys"] });
      // 新建 key 可能引入新的 namespace/environment,刷新下拉数据源
      qc.invalidateQueries({ queryKey: ["listNamespaces"] });
      if (res.entry) setIsNew(false);
    },
    onError: (e) => {
      const err = toAppError(e);
      setSaveError(err.message);
      // 将服务端语法校验错误标注到编辑器首行
      if (err.code === Code.InvalidArgument) {
        applyMarkers(MARKER_SERVER, [{ line: 1, column: 1, endLine: 1, endColumn: 200, message: err.message }]);
      }
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

  // ------------------------------------------------------------ 全屏

  // Monaco 聚焦时会先吃掉 Esc,所以除了这里的 window 监听,
  // onMount 里还注册了一条编辑器内的 Esc 命令。
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isFullscreen]);

  // ------------------------------------------------------------ 渲染

  const formattable = canFormat(format);
  const firstIssue = check.issues[0];
  const saveBlocked = !check.ok;
  const saveDisabledReason = saveBlocked
    ? `内容不是合法的 ${formatLabel(format)},修好后才能保存`
    : "";

  const editorNode = useMemo(
    () => (
      <Editor
        height="100%"
        language={formatToLanguage(format)}
        value={value}
        onChange={(v) => setValue(v ?? "")}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
          editor.addAction({
            id: "config-format-document",
            label: "格式化配置",
            keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
            run: () => doFormatRef.current(),
          });
          editor.addCommand(monaco.KeyCode.Escape, () => setIsFullscreen(false));
        }}
        options={{
          fontSize: 13,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: 2,
          automaticLayout: true,
        }}
      />
    ),
    [format, value],
  );

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
        <Alert severity="error">加载失败:{toAppError(error).message}</Alert>
      </Box>
    );
  }

  const formatButton = (
    <Tooltip title={formattable ? "格式化 (Alt+Shift+F)" : `${formatLabel(format)} 没有可重排的结构`}>
      <span>
        <Button size="small" startIcon={<Wand2 size={18} />} disabled={!formattable} onClick={doFormat}>
          格式化
        </Button>
      </span>
    </Tooltip>
  );

  const saveButton = (
    <Tooltip title={saveDisabledReason}>
      <span>
        <Button
          variant="contained"
          startIcon={<Save size={18} />}
          disabled={save.isPending || saveBlocked}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "保存中…" : "保存"}
        </Button>
      </span>
    </Tooltip>
  );

  const statusChip = check.ok ? (
    <Chip
      size="small"
      color="success"
      variant="outlined"
      icon={<CheckCircle2 size={14} />}
      label={`${formatLabel(format)} 格式正确`}
    />
  ) : (
    <Tooltip title={`${firstIssue.message}(点击跳转)`}>
      <Chip
        size="small"
        color="error"
        variant="outlined"
        icon={<XCircle size={14} />}
        onClick={() => revealIssue(firstIssue)}
        label={`第 ${firstIssue.line} 行 第 ${firstIssue.column} 列: ${firstIssue.message}`}
        sx={{ maxWidth: 420, cursor: "pointer" }}
      />
    </Tooltip>
  );

  const fullscreenButton = (
    <Tooltip title={isFullscreen ? "退出全屏 (Esc)" : "全屏"}>
      <IconButton size="small" onClick={() => setIsFullscreen((v) => !v)}>
        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </IconButton>
    </Tooltip>
  );

  return (
    <Box
      sx={{
        maxWidth: 1080,
        width: "100%",
        mx: "auto",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: sp[3],
      }}
    >
      {/* 头部:key + 操作 */}
      <Card sx={{ p: sp[4], flexShrink: 0 }}>
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
          {saveButton}
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
        <Alert severity="error" onClose={() => setSaveError(null)} sx={{ flexShrink: 0 }}>
          保存失败:{saveError}
        </Alert>
      )}
      {isSecret && !isNew && data?.entry?.value === "******" && (
        <Alert severity="warning" sx={{ flexShrink: 0 }}>
          该项为密钥,值已脱敏显示为 ****** ;直接保存会覆盖真实值。
        </Alert>
      )}

      {/* Monaco 编辑器:非全屏时吃满剩余高度,全屏时铺满视口 */}
      <Card
        sx={{
          p: sp[1],
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          ...(isFullscreen ? fullscreenOverlay : { flex: 1, minHeight: 240 }),
        }}
      >
        {/* 工具条:格式化紧挨全屏按钮(都是「对着编辑器本身」的操作,跟头部的 key 级操作分开);
            全屏时额外把保存带上,免得为了保存先退出全屏 */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: sp[2],
            px: sp[2],
            py: sp[1],
            flexShrink: 0,
          }}
        >
          {isFullscreen && (
            <Typography sx={{ fontFamily: "monospace", fontWeight: 700 }}>
              {key}
              <Typography component="span" color="text.secondary" sx={{ ml: sp[2] }}>
                {ns}/{env}
              </Typography>
            </Typography>
          )}
          {statusChip}
          <Box sx={{ flex: 1 }} />
          {isFullscreen && saveButton}
          {formatButton}
          {fullscreenButton}
        </Box>

        <Box
          sx={{
            ...glassPanel,
            background: "rgba(255,255,255,0.85)",
            borderRadius: "12px",
            overflow: "hidden",
            flex: 1,
            minHeight: 0,
          }}
        >
          {editorNode}
        </Box>
      </Card>
    </Box>
  );
}
