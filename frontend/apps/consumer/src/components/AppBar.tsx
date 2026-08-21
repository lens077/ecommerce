import AccountCircle from "@mui/icons-material/AccountCircle";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import { alpha, styled } from "@mui/material/styles";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { callUnaryMethod } from "@connectrpc/connect-query";
import { getPublicTransport } from "@ecommerce/api";
import { SearchService } from "@/gen/api";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { LocaleSwitcher } from "@ecommerce/ui";
// getSigninUrl 已不再使用：登录统一走 AuthProvider 的 login()（PKCE）
import { useAuthActions, useAuthState } from "@/providers/AuthProvider";
import type { Product } from "@/gen/api";
import { useCartBadge } from "@/hooks/useCart";
import { lantern } from "@/styles/tokens";
import { BrandMark } from "@/components/home/DemoArt";
import { userStore } from "@/store/users";
import { addNotification } from "@ecommerce/utils";

const Search = styled("div")(({ theme }) => ({
  position: "relative",
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.15),
  "&:hover": {
    backgroundColor: alpha(theme.palette.common.white, 0.25),
  },
  marginRight: theme.spacing(2),
  marginLeft: 0,
  width: "100%",
  display: "flex",
  alignItems: "center",
  [theme.breakpoints.up("sm")]: {
    marginLeft: theme.spacing(3),
    width: "auto",
  },
}));

// 「灯市」皮肤:纸底 + 竹线,结构与逻辑不动(见 context/team & DESIGN.md)
const StyledAppBar = styled(AppBar)(() => ({
  backgroundColor: "rgba(246, 239, 225, 0.92)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "none",
  borderBottom: `1px solid ${lantern.bamboo}`,
}));

const SearchResults = styled(Paper)(({ theme }) => ({
  marginTop: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  boxShadow: "0 14px 40px -18px rgba(42, 42, 40, 0.35)",
  backgroundColor: "rgba(246, 239, 225, 0.96)",
  border: "1px solid #D8B48A",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  padding: theme.spacing(2),
  minHeight: 300,
}));

const SearchContainer = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  width: "100%",
  [theme.breakpoints.up("sm")]: {
    width: "auto",
  },
}));

const SearchIconWrapper = styled("div")(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  "&:hover": {
    opacity: 0.8,
  },
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: "inherit",
  "& .MuiInputBase-input": {
    padding: theme.spacing(1, 1, 1, 0),
    // vertical padding + font size from searchIcon
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    // width 无任何状态触发变化(仅断点静态值),原 transition("width") 是从未播放的死代码,已删
    width: "100%",
    [theme.breakpoints.up("md")]: {
      width: "20ch",
    },
  },
}));

export default function PrimarySearchAppBar() {
  // ⚠️ 用订阅式的 useAuthState()，不要调 isLoggedIn()。
  // 后者是普通函数：令牌改为**内存态**后（防 XSS，见 utils/tokenStore.ts），
  // 登录成功不再产生任何能触发重渲染的信号，顶栏会永远停在首次渲染的结果 ——
  // 表现为"登录明明成功了（用户资料都已拿到），顶栏还显示未登录"（Playwright 实测）。
  // 它此前"碰巧能用"，只是因为读的是同步可读的 localStorage。
  const { isAuthenticated } = useAuthState();
  const { login, logout } = useAuthActions();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const cartCount = useCartBadge();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [mobileMoreAnchorEl, setMobileMoreAnchorEl] = React.useState<null | HTMLElement>(null);
  const [searchInput, setSearchInput] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<Product[]>([]);
  const [showSearchResults, setShowSearchResults] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const lastSearchTimeRef = React.useRef<number>(0);
  const DEBOUNCE_DELAY = 500; // 限流延迟时间

  const isMenuOpen = Boolean(anchorEl);
  const isMobileMenuOpen = Boolean(mobileMoreAnchorEl);

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMobileMenuClose = () => {
    setMobileMoreAnchorEl(null);
  };

  const handleMenuClose = async (path?: string) => {
    setAnchorEl(null);
    handleMobileMenuClose();

    if (path === "/logout") {
      // ⚠️ 必须走 AuthProvider 的 logout()，不要在这里自己清。
      // 原实现只调了 clearToken() 并手工把 store 拍成空对象，**漏了 stopRenew()** ——
      // 续期定时器在登出后照跑，到点用 Casdoor 的会话 Cookie 静默换一份新令牌，
      // 于是「登出后过一会儿自己又登回去了」。清 store 与跳首页 logout() 里都有。
      logout();
      addNotification({
        message: t("appBar.signOutSuccess"),
        severity: "success",
      });
    } else if (path) {
      await navigate({
        to: path,
      });
    }
  };

  const handleMobileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMobileMoreAnchorEl(event.currentTarget);
  };

  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchInput(value);
  };

  const handleSearch = () => {
    if (!searchInput.trim()) return;

    const now = Date.now();
    if (now - lastSearchTimeRef.current < DEBOUNCE_DELAY) {
      console.log("搜索过于频繁，请稍后再试");
      return;
    }

    lastSearchTimeRef.current = now;

    // 取消之前的搜索
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 创建新的AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsSearching(true);

    // 搜索是公开接口，走免鉴权 transport。自带节流与 abort，不进查询缓存，
    // 所以用 callUnaryMethod 直接调而不是 useQuery
    callUnaryMethod(
      getPublicTransport(),
      SearchService.method.search,
      { name: searchInput.trim() },
      { signal: abortController.signal },
    )
      .then((response) => {
        setSearchResults(response.products || []);
        setShowSearchResults(true);
      })
      .catch((error) => {
        console.error("搜索失败:", error);
        setSearchResults([]);
        setShowSearchResults(true);
      })
      .finally(() => {
        setIsSearching(false);
      });
  };

  const handleSearchResultClick = (product: Product) => {
    console.log("点击搜索结果:", product);
    // 导航到商品详情页
    void navigate({ to: "/product/$spuCode", params: { spuCode: product.spuCode } });
    // 清空搜索状态
    setSearchInput("");
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const menuId = "primary-search-account-menu";
  const renderMenu = (
    <Menu
      anchorEl={anchorEl}
      anchorOrigin={{
        vertical: "top",
        horizontal: "right",
      }}
      id={menuId}
      keepMounted
      transformOrigin={{
        vertical: "top",
        horizontal: "right",
      }}
      open={isMenuOpen}
      onClose={() => handleMenuClose()}
    >
      <MenuItem disabled>
        <Typography variant="body2" color="text.secondary">
          {t("appBar.signedInAs", {
            name: userStore.account.name || userStore.account.email,
          })}
        </Typography>
      </MenuItem>
      <MenuItem onClick={() => handleMenuClose("/profile")}>{t("appBar.myAccount")}</MenuItem>
      <MenuItem onClick={() => handleMenuClose("/logout")}>{t("common:action.signOut")}</MenuItem>
    </Menu>
  );

  const mobileMenuId = "primary-search-account-menu-mobile";
  const renderMobileMenu = (
    <Menu
      anchorEl={mobileMoreAnchorEl}
      anchorOrigin={{
        vertical: "top",
        horizontal: "right",
      }}
      id={mobileMenuId}
      keepMounted
      transformOrigin={{
        vertical: "top",
        horizontal: "right",
      }}
      open={isMobileMenuOpen}
      onClose={handleMobileMenuClose}
    >
      <MenuItem onClick={() => navigate({ to: "/cart" })}>
        <IconButton size="large" aria-label="shopping cart" color="inherit">
          <Badge badgeContent={cartCount} color="error">
            <ShoppingCartIcon />
          </Badge>
        </IconButton>
        <p>{t("appBar.cart")}</p>
      </MenuItem>
      <MenuItem onClick={handleProfileMenuOpen}>
        <IconButton
          size="large"
          aria-label="account of current user"
          aria-controls="primary-search-account-menu"
          aria-haspopup="true"
          color="inherit"
        >
          {userStore.account.avatar ? (
            <Avatar src={userStore.account.avatar} alt={userStore.account.name} />
          ) : (
            <AccountCircle />
          )}
        </IconButton>
        <p>{t("appBar.profile")}</p>
      </MenuItem>
    </Menu>
  );

  return (
    <Box sx={{ flexGrow: 1 }}>
      <StyledAppBar position="sticky">
        <Toolbar
          sx={{
            color: "text.primary",
          }}
        >
          {/* 品牌 Logo */}
          <Box
            onClick={() => navigate({ to: "/" })}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              cursor: "pointer",
              mr: 2,
              "&:hover": {
                opacity: 0.8,
              },
              transition: "opacity 0.2s ease",
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: "6px",
                backgroundColor: lantern.vermilion,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "inset 0 0 0 1px rgba(253, 248, 236, 0.4)",
              }}
            >
              <Box sx={{ color: "#FDF8EC" }}>
                <BrandMark size={22} />
              </Box>
            </Box>
            <Typography
              variant="h6"
              noWrap
              component="div"
              sx={{
                display: { xs: "none", sm: "block" },
                fontFamily: lantern.serif,
                fontWeight: 900,
                color: lantern.ink,
                letterSpacing: "0.06em",
              }}
            >
              {t("meta.title")}
            </Typography>
          </Box>
          <SearchContainer>
            <Search
              sx={{
                backgroundColor: lantern.paperAsh,
                borderRadius: "6px",
                border: `1px solid ${lantern.bamboo}`,
                transition: "all 0.3s ease",
                "&:hover": {
                  backgroundColor: "#EFE6D2",
                  border: `1px solid ${lantern.bambooDeep}`,
                },
                "&:focus-within": {
                  backgroundColor: "#FFF7E0",
                  border: `1px solid ${lantern.vermilion}`,
                  boxShadow: "0 0 0 3px rgba(194, 55, 43, 0.14)",
                },
              }}
            >
              <StyledInputBase
                placeholder={t("appBar.searchPlaceholder")}
                inputProps={{ "aria-label": "search" }}
                value={searchInput}
                onChange={handleSearchInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault(); // 阻止任何默认行为（如换行或表单提交）
                    handleSearch(); // 直接复用点击搜索的逻辑
                  }
                }}
                sx={{
                  "& input": {
                    "&::placeholder": {
                      color: "text.secondary",
                      opacity: 0.7,
                    },
                  },
                }}
              />
              <SearchIconWrapper
                onClick={handleSearch}
                sx={{
                  "&:hover": {
                    color: lantern.vermilion,
                  },
                }}
              >
                {isSearching ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
              </SearchIconWrapper>
            </Search>
          </SearchContainer>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            sx={{
              display: { xs: "none", md: "flex" },
              alignItems: "center",
              gap: 1,
            }}
          >
            <LocaleSwitcher size="large" />
            <IconButton
              size="large"
              aria-label="shopping cart"
              color="inherit"
              onClick={() => navigate({ to: "/cart" })}
              sx={{
                "&:hover": {
                  backgroundColor: "rgba(194, 55, 43, 0.08)",
                },
              }}
            >
              <Badge badgeContent={cartCount} color="error">
                <ShoppingCartIcon />
              </Badge>
            </IconButton>
            {isAuthenticated ? (
              <IconButton
                size="large"
                edge="end"
                aria-label="account of current user"
                aria-controls={menuId}
                aria-haspopup="true"
                onClick={handleProfileMenuOpen}
                color="inherit"
                sx={{
                  ml: 1,
                  "&:hover": {
                    backgroundColor: "rgba(194, 55, 43, 0.08)",
                  },
                }}
              >
                {userStore.account.avatar ? (
                  <Avatar src={userStore.account.avatar} alt={userStore.account.name} />
                ) : (
                  <AccountCircle />
                )}
              </IconButton>
            ) : (
              <Button
                variant="contained"
                onClick={() => {
                  // 必须走 AuthProvider 的 login()（PKCE）。
                  // 曾经这里是 `window.location.href = getSigninUrl()` —— casdoor-js-sdk 的
                  // 老路径：它把 state 写进自己的 `casdoor-state`，且**不生成 code_verifier**，
                  // 而 /callback 用的是 PKCE 的 exchangeCode()，读 `oauth_state`/`oauth_code_verifier`。
                  // 两套机制混用 ⇒ 回调必然报「OAuth state 校验失败」。
                  // 之所以一直没被发现：开了「自动登录」的用户靠 silentRenew 就静默登进去了，
                  // 根本走不到这个按钮（2026-08-19 用全新浏览器实测复现）。
                  login();
                }}
                sx={{
                  ml: 2,
                  borderRadius: "6px",
                  background: lantern.vermilion,
                  boxShadow: "inset 0 0 0 1px rgba(253, 248, 236, 0.4)",
                  "&:hover": {
                    background: lantern.vermilionDeep,
                  },
                }}
              >
                {t("common:action.signIn")}
              </Button>
            )}
          </Box>
          <Box sx={{ display: { xs: "flex", md: "none" }, alignItems: "center" }}>
            <LocaleSwitcher size="small" />
            {isAuthenticated ? (
              <IconButton
                size="large"
                aria-label="show more"
                aria-controls={mobileMenuId}
                aria-haspopup="true"
                onClick={handleMobileMenuOpen}
                color="inherit"
              >
                <MoreVertIcon />
              </IconButton>
            ) : (
              <Button
                size="small"
                onClick={() => {
                  // 必须走 AuthProvider 的 login()（PKCE）。
                  // 曾经这里是 `window.location.href = getSigninUrl()` —— casdoor-js-sdk 的
                  // 老路径：它把 state 写进自己的 `casdoor-state`，且**不生成 code_verifier**，
                  // 而 /callback 用的是 PKCE 的 exchangeCode()，读 `oauth_state`/`oauth_code_verifier`。
                  // 两套机制混用 ⇒ 回调必然报「OAuth state 校验失败」。
                  // 之所以一直没被发现：开了「自动登录」的用户靠 silentRenew 就静默登进去了，
                  // 根本走不到这个按钮（2026-08-19 用全新浏览器实测复现）。
                  login();
                }}
                sx={{
                  borderRadius: "6px",
                  background: lantern.vermilion,
                  color: "#FDF8EC",
                  "&:hover": { background: lantern.vermilionDeep },
                }}
              >
                {t("common:action.signIn")}
              </Button>
            )}
          </Box>
        </Toolbar>
      </StyledAppBar>
      {showSearchResults && (
        <SearchResults
          sx={{
            maxHeight: "70vh",
            overflowY: "auto",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t("appBar.searchResults")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("appBar.searchResultCount", { count: searchResults.length })}
            </Typography>
          </Box>
          {isSearching ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : searchResults.length > 0 ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
                gap: 2,
              }}
            >
              {searchResults.map((product) => (
                <Box
                  key={product.id}
                  sx={{
                    border: `1px solid ${lantern.bamboo}`,
                    borderRadius: "10px",
                    backgroundColor: "#F9F3E6",
                    padding: 2,
                    transition: "all 0.2s ease",
                    "&:hover": {
                      borderColor: lantern.bambooDeep,
                      backgroundColor: "#FFF7E0",
                      boxShadow: "inset 0 0 30px rgba(255, 233, 184, 0.8)",
                      transform: "translateY(-2px)",
                    },
                    cursor: "pointer",
                  }}
                  onClick={() => handleSearchResultClick(product)}
                >
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <Avatar
                      src={product.mainMediaUrl}
                      alt={product.name}
                      sx={{
                        width: 80,
                        height: 80,
                        mb: 2,
                        borderRadius: "6px",
                      }}
                    />
                    <Typography
                      variant="subtitle1"
                      sx={{
                        textAlign: "center",
                        fontWeight: 500,
                        mb: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        width: "100%",
                      }}
                    >
                      {product.name}
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                        fontFamily: lantern.serif,
                        fontWeight: 700,
                        color: lantern.vermilion,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatCurrency(product.price)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t("appBar.sold", { count: product.quantity })}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body1" sx={{ textAlign: "center", py: 4 }}>
              {t("appBar.searchEmpty")}
            </Typography>
          )}
        </SearchResults>
      )}
      {renderMobileMenu}
      {renderMenu}
    </Box>
  );
}
