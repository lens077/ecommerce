import { createFileRoute } from "@tanstack/react-router";
import { Box, Card, CardContent, Typography } from "@mui/material";
import { sp } from "@/styles/glass";

export const Route = createFileRoute("/")({
  component: HomePage,
});

// 占位首页;完整的 key 浏览器/编辑器在后续页面模块实现。
function HomePage() {
  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      <Card>
        <CardContent sx={{ p: sp[6] }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: sp[2] }}>
            欢迎使用配置中心
          </Typography>
          <Typography color="text.secondary">
            以键值粒度管理网关与微服务配置,支持版本历史、yml/toml/json 语法高亮与校验。
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
