import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { DiffEditor } from "@monaco-editor/react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { ArrowLeft, RefreshCw, RotateCcw } from "lucide-react";
import { toAppError } from "@ecommerce/api";
import { configApi, ConfigFormat } from "@/api";
import { formatToLanguage } from "@/lib/format";
import { lineDelta } from "@/lib/linediff";
import { sp } from "@/styles/glass";

const SearchSchema = z.object({
  ns: z.string().default("ecommerce"),
  env: z.string().default("dev"),
  key: z.string(),
});

export const Route = createFileRoute("/history")({
  component: HistoryPage,
  validateSearch: SearchSchema,
});

/** 后端对密钥的历史值也做脱敏,占位值与 GetKey 一致 */
const MASKED = "******";

const LIST_WIDTH = 340;
const HAIRLINE = "1px solid rgba(15, 23, 42, 0.08)";

type Timestamp = { seconds: bigint; nanos: number };

function toDate(ts?: Timestamp): Date | null {
  if (!ts) return null;
  return new Date(Number(ts.seconds) * 1000 + Math.floor(ts.nanos / 1e6));
}

function fmtAbsolute(ts?: Timestamp): string {
  return toDate(ts)?.toLocaleString() ?? "";
}

/** 「3 分钟前」。列表里扫一眼就知道新旧,精确时间放 tooltip。 */
function fmtRelative(ts?: Timestamp): string {
  const d = toDate(ts);
  if (!d) return "";
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.round(hour / 24);
  if (day < 30) return `${day} 天前`;
  return d.toLocaleDateString();
}

function HistoryPage() {
  const { ns, env, key } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<number | null>(null);
  const [compareWith, setCompareWith] = useState<"current" | "prev">("current");
  const [pendingRollback, setPendingRollback] = useState<number | null>(null);

  // 换了 key 就得丢掉上一个 key 的选中版本号,否则会指向一个不存在的版本
  useEffect(() => {
    setSelected(null);
  }, [ns, env, key]);

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

  const rollback = useMutation({
    mutationFn: (version: number) =>
      configApi.rollback(ns, env, key, version, `回滚到 v${version}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["getKey", ns, env, key] });
      qc.invalidateQueries({ queryKey: ["listRevisions", ns, env, key] });
      qc.invalidateQueries({ queryKey: ["listKeys"] });
      navigate({ to: "/edit", search: { ns, env, key } });
    },
  });

  const entry = current.data?.entry;
  // 后端按 version 倒序返回:revs[0] 最新
  const revs = revisions.data?.revisions ?? [];
  const language = formatToLanguage(entry?.format ?? ConfigFormat.YAML);
  // 密钥的历史值同样是 ******,拿它做 diff 没有意义
  const masked = entry?.isSecret === true || revs.some((r) => r.value === MASKED);

  // 每一版相对上一版改了多少行。值都在手上,顺手算出来,列表才有信息量。
  const rows = useMemo(
    () =>
      revs.map((rev, i) => {
        const older = revs[i + 1];
        return {
          rev,
          // 初始版本没有可比对象;脱敏后比了也是零
          delta: older && !masked ? lineDelta(older.value, rev.value) : null,
          unchanged: older != null && !masked && older.value === rev.value,
          isOldest: i === revs.length - 1,
        };
      }),
    [revs, masked],
  );

  // 默认选中次新版本:历史页最常见的问题是「上一次改了什么」
  const defaultVersion = revs.length > 1 ? revs[1].version : revs[0]?.version;
  const activeVersion = selected ?? defaultVersion ?? null;
  const activeIdx = revs.findIndex((r) => r.version === activeVersion);
  const activeRev = activeIdx >= 0 ? revs[activeIdx] : undefined;
  const olderRev = activeIdx >= 0 ? revs[activeIdx + 1] : undefined;

  // 「对比当前」= 选中版 → 线上值;「对比上一版」= 更旧的一版 → 选中版(即这一版改了什么)
  const compareCurrent = compareWith === "current";
  const left = compareCurrent ? activeRev : olderRev;
  const right = compareCurrent ? undefined : activeRev;
  const rightValue = compareCurrent ? (entry?.value ?? "") : (right?.value ?? "");
  const rightLabel = compareCurrent ? `当前 v${entry?.version ?? "?"}` : `v${right?.version ?? "?"}`;

  const isCurrent = (version: number) => entry != null && version === entry.version;

  // ---------------------------------------------------------------- 版本列表

  let listBody: React.ReactNode;
  if (revisions.isLoading) {
    listBody = (
      <Box sx={{ p: sp[6], textAlign: "center" }}>
        <CircularProgress size={22} />
      </Box>
    );
  } else if (revisions.isError) {
    // 原先这里把加载失败也画成「暂无历史」—— 一个 v22 的 key 看着像从没改过,
    // 错的地方(后端/网关)完全被掩盖掉了
    listBody = (
      <Box sx={{ p: sp[3] }}>
        <Alert
          severity="error"
          action={
            <Button size="small" color="inherit" onClick={() => revisions.refetch()}>
              重试
            </Button>
          }
        >
          加载历史失败:{toAppError(revisions.error).message}
        </Alert>
      </Box>
    );
  } else if (rows.length === 0) {
    listBody = (
      <Box sx={{ p: sp[4] }}>
        <Typography color="text.secondary" variant="body2">
          这个 key 还没有历史版本。
        </Typography>
      </Box>
    );
  } else {
    listBody = (
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
        {rows.map(({ rev, delta, unchanged, isOldest }) => {
          const active = rev.version === activeVersion;
          return (
            <Box
              component="li"
              key={rev.version}
              onClick={() => setSelected(rev.version)}
              sx={{
                px: sp[3],
                py: sp[2],
                cursor: "pointer",
                borderBottom: HAIRLINE,
                borderLeft: "3px solid",
                borderLeftColor: active ? "primary.main" : "transparent",
                background: active ? "rgba(37, 99, 235, 0.08)" : "transparent",
                "&:hover": { background: active ? "rgba(37, 99, 235, 0.12)" : "rgba(15, 23, 42, 0.04)" },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: sp[2] }}>
                <Typography sx={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14 }}>
                  v{rev.version}
                </Typography>
                {isCurrent(rev.version) && <Chip label="当前" size="small" color="primary" />}
                {isOldest && <Chip label="初始" size="small" variant="outlined" />}
                <Box sx={{ flex: 1 }} />
                {unchanged ? (
                  <Tooltip title="与上一版内容完全相同">
                    <Chip label="无变更" size="small" variant="outlined" />
                  </Tooltip>
                ) : (
                  delta && (
                    <Typography
                      component="span"
                      sx={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "nowrap" }}
                    >
                      <Box component="span" sx={{ color: "success.main" }}>
                        +{delta.added}
                      </Box>{" "}
                      <Box component="span" sx={{ color: "error.main" }}>
                        −{delta.removed}
                      </Box>
                    </Typography>
                  )
                )}
              </Box>

              <Typography
                variant="body2"
                sx={{
                  mt: sp[1],
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: rev.comment ? "text.primary" : "text.disabled",
                  fontStyle: rev.comment ? "normal" : "italic",
                }}
                title={rev.comment}
              >
                {rev.comment || "无备注"}
              </Typography>

              <Tooltip title={fmtAbsolute(rev.createdAt)} placement="right">
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {rev.author || "—"} · {fmtRelative(rev.createdAt)}
                </Typography>
              </Tooltip>
            </Box>
          );
        })}
      </Box>
    );
  }

  // ---------------------------------------------------------------- diff 面板

  let diffBody: React.ReactNode;
  if (masked && revs.length > 0) {
    diffBody = (
      <Alert severity="info" sx={{ m: sp[3] }}>
        该 key 标记为密钥,历史值已脱敏为 {MASKED},无法比对内容。版本、作者、时间与备注仍然可查。
      </Alert>
    );
  } else if (!activeRev) {
    diffBody = (
      <Box sx={{ p: sp[6], textAlign: "center" }}>
        <Typography color="text.secondary" variant="body2">
          {revisions.isLoading ? "加载中…" : "从左侧选一个版本查看差异。"}
        </Typography>
      </Box>
    );
  } else if (!compareCurrent && !olderRev) {
    diffBody = (
      <Alert severity="info" sx={{ m: sp[3] }}>
        v{activeRev.version} 是初始版本,没有更早的版本可比。切到「对比当前」看它与线上值的差异。
      </Alert>
    );
  } else {
    diffBody = (
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <DiffEditor
          height="100%"
          language={language}
          original={left?.value ?? ""}
          modified={rightValue}
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            readOnly: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            // 左右分栏在窄容器里会把每一栏挤到放不下一行配置(行尾直接被截掉),
            // 低于这个宽度就自动切成上下对照的内联视图 —— 宁可少一栏,也要看得全
            renderSideBySide: true,
            useInlineViewWhenSpaceIsLimited: true,
            renderSideBySideInlineBreakpoint: 900,
            // 长值(连接串、URL)照样会超出一行,让它折行而不是被裁掉
            wordWrap: "on",
            diffWordWrap: "inherit",
          }}
        />
      </Box>
    );
  }

  // ---------------------------------------------------------------- 渲染

  return (
    <Box
      sx={{
        width: "100%",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: sp[3],
      }}
    >
      {/* 头部:直接铺在页面上,不再套一层卡片 */}
      <Box
        sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: sp[2], flexShrink: 0 }}
      >
        <Button
          startIcon={<ArrowLeft size={18} />}
          onClick={() => navigate({ to: "/edit", search: { ns, env, key } })}
        >
          返回编辑
        </Button>
        <Typography sx={{ fontFamily: "monospace", fontWeight: 700 }}>{key}</Typography>
        <Chip label={`${ns}/${env}`} size="small" variant="outlined" />
        {entry && <Chip label={`当前 v${entry.version}`} size="small" />}
        {entry?.isSecret && <Chip label="密钥" size="small" color="warning" variant="outlined" />}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          startIcon={<RefreshCw size={16} />}
          disabled={revisions.isFetching}
          onClick={() => {
            revisions.refetch();
            current.refetch();
          }}
        >
          刷新
        </Button>
      </Box>

      {current.isError && (
        <Alert severity="error" sx={{ flexShrink: 0 }}>
          读取当前值失败:{toAppError(current.error).message}
        </Alert>
      )}
      {rollback.isError && (
        <Alert severity="error" sx={{ flexShrink: 0 }} onClose={() => rollback.reset()}>
          回滚失败:{toAppError(rollback.error).message}
        </Alert>
      )}

      {/* 主体:一块面板内左右分栏,不再是两张互相挤压的卡片 */}
      <Card
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          overflow: "hidden",
          p: 0,
        }}
      >
        {/* 左:版本列表 */}
        <Box
          sx={{
            width: { xs: "100%", md: LIST_WIDTH },
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
            maxHeight: { xs: 260, md: "none" },
            borderRight: { md: HAIRLINE },
            borderBottom: { xs: HAIRLINE, md: "none" },
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "baseline",
              gap: sp[2],
              px: sp[3],
              py: sp[2],
              flexShrink: 0,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              版本历史
            </Typography>
            {rows.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                共 {rows.length} 个版本
              </Typography>
            )}
          </Box>
          <Divider />
          <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>{listBody}</Box>
        </Box>

        {/* 右:差异。minWidth:0 是关键 —— 否则 Monaco 的固有宽度会把这一栏顶成窄条 */}
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: sp[2],
              px: sp[3],
              py: sp[2],
              flexShrink: 0,
            }}
          >
            <ToggleButtonGroup
              size="small"
              exclusive
              value={compareWith}
              onChange={(_, v) => v && setCompareWith(v)}
            >
              <ToggleButton value="current">对比当前</ToggleButton>
              <ToggleButton value="prev">对比上一版</ToggleButton>
            </ToggleButtonGroup>

            {activeRev && (
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                左:{left ? `v${left.version}` : "(空)"}　→　右:{rightLabel}
              </Typography>
            )}

            <Box sx={{ flex: 1 }} />

            {activeRev && (
              <Tooltip
                title={
                  isCurrent(activeRev.version)
                    ? "这已经是当前版本"
                    : `把 v${activeRev.version} 的内容写成新版本`
                }
              >
                <span>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<RotateCcw size={16} />}
                    disabled={rollback.isPending || isCurrent(activeRev.version)}
                    onClick={() => setPendingRollback(activeRev.version)}
                  >
                    回滚到 v{activeRev.version}
                  </Button>
                </span>
              </Tooltip>
            )}
          </Box>
          <Divider />
          {diffBody}
        </Box>
      </Card>

      {/* 回滚会产生一个新版本并立刻下发给在跑的服务,值得先问一句 */}
      <Dialog open={pendingRollback !== null} onClose={() => setPendingRollback(null)}>
        <DialogTitle>回滚到 v{pendingRollback}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            会把 v{pendingRollback} 的内容写成新版本 v{(entry?.version ?? 0) + 1}(历史不会被删除),
            并立即下发给正在运行的服务。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingRollback(null)}>取消</Button>
          <Button
            variant="contained"
            disabled={rollback.isPending}
            onClick={() => {
              if (pendingRollback !== null) rollback.mutate(pendingRollback);
              setPendingRollback(null);
            }}
          >
            确认回滚
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
