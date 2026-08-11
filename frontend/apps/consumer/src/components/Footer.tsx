import { Box, Container, Typography, Link } from "@mui/material";
import { useTranslation } from "@ecommerce/i18n";
import { lantern } from "@/styles/tokens";
import { BrandMark } from "@/components/home/DemoArt";

const Footer: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Box
      component="footer"
      sx={{
        // 「灯市」皮肤:纸灰底 + 竹线
        backgroundColor: lantern.paperAsh,
        borderTop: `1px solid ${lantern.bamboo}`,
        color: lantern.ink,
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
                  borderRadius: "6px",
                  backgroundColor: lantern.vermilion,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "inset 0 0 0 1px rgba(253, 248, 236, 0.4)",
                }}
              >
                <Box sx={{ color: "#FDF8EC" }}>
                  <BrandMark size={24} />
                </Box>
              </Box>
              <Typography
                variant="h6"
                sx={{
                  fontFamily: lantern.serif,
                  fontWeight: 900,
                  color: lantern.ink,
                  letterSpacing: "0.06em",
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
                fontFamily: lantern.serif,
                fontWeight: 700,
                mb: 2,
                color: lantern.ink,
              }}
            >
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
                    color: lantern.vermilion,
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
                    color: lantern.vermilion,
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
                    color: lantern.vermilion,
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
                fontFamily: lantern.serif,
                fontWeight: 700,
                mb: 2,
                color: lantern.ink,
              }}
            >
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
                    color: lantern.vermilion,
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
                    color: lantern.vermilion,
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
                    color: lantern.vermilion,
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
                fontFamily: lantern.serif,
                fontWeight: 700,
                mb: 2,
                color: lantern.ink,
              }}
            >
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
                    color: lantern.vermilion,
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
                    color: lantern.vermilion,
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
                    color: lantern.vermilion,
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
            height: "1px",
            backgroundColor: lantern.bamboo,
            opacity: 0.6,
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
                fontSize: "0.85rem",
                "&:hover": { color: lantern.vermilion },
              }}
            >
              {t("footer.sitemap")}
            </Link>
            <Link
              href="#"
              sx={{
                textDecoration: "none",
                color: "text.secondary",
                fontSize: "0.85rem",
                "&:hover": { color: lantern.vermilion },
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
