import { Box, Container, Typography, Link, Grid } from "@mui/material";

const Footer: React.FC = () => {
  return (
    <Box
      sx={{
        backgroundColor: "rgba(255, 255, 255, 0.8)",
        backdropFilter: "blur(10px)",
        py: 4,
        mt: "auto",
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: "bold" }}>
              关于我们
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.primary",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                公司简介
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.primary",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                联系我们
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.primary",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                加入我们
              </Link>
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: "bold" }}>
              帮助中心
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.primary",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                常见问题
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.primary",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                购物指南
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.primary",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                售后服务
              </Link>
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: "bold" }}>
              隐私与条款
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.primary",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                隐私政策
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.primary",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                服务条款
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.primary",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                Cookie政策
              </Link>
            </Box>
          </Grid>
        </Grid>
        <Box sx={{ mt: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            © {new Date().getFullYear()} 电子商务平台. 保留所有权利.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default Footer;
