import { Box, Container, Typography, Link } from "@mui/material";
import StorefrontIcon from "@mui/icons-material/Storefront";
import { useTranslation } from "@ecommerce/i18n";

const Footer: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Box
      component="footer"
      sx={{
        background: "linear-gradient(180deg, #f8f9ff 0%, #ffffff 100%)",
        borderTop: "1px solid rgba(102, 126, 234, 0.1)",
        py: 6,
        mt: "auto",
      }}
    >
      <Container maxWidth="lg">
        {/* 主要内容区 */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
            gap: 4,
            mb: 5,
          }}
        >
          {/* 品牌区 */}
          <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 1" } }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
                }}
              >
                <StorefrontIcon sx={{ color: "white", fontSize: 24 }} />
              </Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {t("footer.brand")}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
              {t("footer.tagline")}
            </Typography>
          </Box>

          {/* 关于我们 */}
          <Box>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                mb: 2,
                color: "text.primary",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Box
                sx={{
                  width: 4,
                  height: 16,
                  borderRadius: 2,
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              />
              {t("footer.about.title")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.secondary",
                  transition: "color 0.2s ease",
                  "&:hover": {
                    color: "primary.main",
                    textDecoration: "underline",
                  },
                }}
              >
                {t("footer.about.company")}
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.secondary",
                  transition: "color 0.2s ease",
                  "&:hover": {
                    color: "primary.main",
                    textDecoration: "underline",
                  },
                }}
              >
                {t("footer.about.contact")}
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.secondary",
                  transition: "color 0.2s ease",
                  "&:hover": {
                    color: "primary.main",
                    textDecoration: "underline",
                  },
                }}
              >
                {t("footer.about.careers")}
              </Link>
            </Box>
          </Box>

          {/* 帮助中心 */}
          <Box>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                mb: 2,
                color: "text.primary",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Box
                sx={{
                  width: 4,
                  height: 16,
                  borderRadius: 2,
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              />
              {t("footer.help.title")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.secondary",
                  transition: "color 0.2s ease",
                  "&:hover": {
                    color: "primary.main",
                    textDecoration: "underline",
                  },
                }}
              >
                {t("footer.help.faq")}
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.secondary",
                  transition: "color 0.2s ease",
                  "&:hover": {
                    color: "primary.main",
                    textDecoration: "underline",
                  },
                }}
              >
                {t("footer.help.guide")}
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.secondary",
                  transition: "color 0.2s ease",
                  "&:hover": {
                    color: "primary.main",
                    textDecoration: "underline",
                  },
                }}
              >
                {t("footer.help.afterSales")}
              </Link>
            </Box>
          </Box>

          {/* 隐私与条款 */}
          <Box>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                mb: 2,
                color: "text.primary",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Box
                sx={{
                  width: 4,
                  height: 16,
                  borderRadius: 2,
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              />
              {t("footer.legal.title")}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.secondary",
                  transition: "color 0.2s ease",
                  "&:hover": {
                    color: "primary.main",
                    textDecoration: "underline",
                  },
                }}
              >
                {t("footer.legal.privacy")}
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.secondary",
                  transition: "color 0.2s ease",
                  "&:hover": {
                    color: "primary.main",
                    textDecoration: "underline",
                  },
                }}
              >
                {t("footer.legal.terms")}
              </Link>
              <Link
                href="#"
                sx={{
                  textDecoration: "none",
                  color: "text.secondary",
                  transition: "color 0.2s ease",
                  "&:hover": {
                    color: "primary.main",
                    textDecoration: "underline",
                  },
                }}
              >
                {t("footer.legal.cookie")}
              </Link>
            </Box>
          </Box>
        </Box>

        {/* 分隔线 */}
        <Box
          sx={{
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.2), transparent)",
            mb: 4,
          }}
        />

        {/* 底部版权区 */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </Typography>
          <Box sx={{ display: "flex", gap: 3 }}>
            <Link
              href="#"
              sx={{
                textDecoration: "none",
                color: "text.secondary",
                fontSize: "0.875rem",
                "&:hover": { color: "primary.main" },
              }}
            >
              {t("footer.sitemap")}
            </Link>
            <Link
              href="#"
              sx={{
                textDecoration: "none",
                color: "text.secondary",
                fontSize: "0.875rem",
                "&:hover": { color: "primary.main" },
              }}
            >
              {t("footer.icp")}
            </Link>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};

export default Footer;