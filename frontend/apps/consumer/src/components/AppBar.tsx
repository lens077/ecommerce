import AccountCircle from "@mui/icons-material/AccountCircle";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import StorefrontIcon from "@mui/icons-material/Storefront";
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
import { searchApi } from "@/api/search";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { LocaleSwitcher } from "@ecommerce/ui";
import { getSigninUrl, isLoggedIn } from "@ecommerce/configs";
import { SEARCH_INDEX } from "@ecommerce/constants";
import type { Product } from "@/gen/api";
import { useCartBadge } from "@/hooks/useCart";
import { userStore } from "@/store/users";
import { addNotification, clearToken } from "@ecommerce/utils";

const Search = styled("div")(({theme}) => ({
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

const StyledAppBar = styled(AppBar)(() => ({
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    boxShadow: "0 4px 30px rgba(0, 0, 0, 0.1)",
    borderBottom: "1px solid rgba(255, 255, 255, 0.3)",
}));

const SearchResults = styled(Paper)(({theme}) => ({
    marginTop: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[10],
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    padding: theme.spacing(2),
    minHeight: 300,
}));

const SearchContainer = styled("div")(({theme}) => ({
    display: "flex",
    alignItems: "center",
    width: "100%",
    [theme.breakpoints.up("sm")]: {
        width: "auto",
    },
}));

const SearchIconWrapper = styled("div")(({theme}) => ({
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

const StyledInputBase = styled(InputBase)(({theme}) => ({
    color: "inherit",
    "& .MuiInputBase-input": {
        padding: theme.spacing(1, 1, 1, 0),
        // vertical padding + font size from searchIcon
        paddingLeft: `calc(1em + ${theme.spacing(4)})`,
        transition: theme.transitions.create("width"),
        width: "100%",
        [theme.breakpoints.up("md")]: {
            width: "20ch",
        },
    },
}));

export default function PrimarySearchAppBar() {
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
            // 执行登出操作
            clearToken();
            // 清空用户store
            userStore.account = {
                createdTime: "",
                displayName: "",
                id: "",
                accessToken: "",
                affiliation: "",
                email: "",
                isAdmin: false,
                language: "",
                organization: "",
                phone: "",
                score: 0,
                tag: "",
                type: "",
                username: "",
                name: "",
                avatar: "",
            };
            // 显示登出成功通知
            addNotification({
                message: t("appBar.signOutSuccess"),
                severity: "success",
            });
            // 跳转到首页
            await navigate({
                to: "/",
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

        // 调用搜索API
        searchApi
            .search(SEARCH_INDEX, searchInput.trim(), abortController.signal)
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
        navigate({to: "/product/$spuCode", params: {spuCode: product.spuCode}});
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
            <MenuItem onClick={() => handleMenuClose("/logout")}>
                {t("common:action.signOut")}
            </MenuItem>
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
            <MenuItem onClick={() => navigate({to: "/cart"})}>
                <IconButton
                    size="large"
                    aria-label="shopping cart"
                    color="inherit"
                >
                    <Badge badgeContent={cartCount} color="error">
                        <ShoppingCartIcon/>
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
                        <Avatar src={userStore.account.avatar} alt={userStore.account.name}/>
                    ) : (
                        <AccountCircle/>
                    )}
                </IconButton>
                <p>{t("appBar.profile")}</p>
            </MenuItem>
        </Menu>
    );

    return (
        <Box sx={{flexGrow: 1}}>
            <StyledAppBar position="sticky">
                <Toolbar sx={{
                    color: 'text.primary'
                }}>
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
                                borderRadius: "10px",
                                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
                            }}
                        >
                            <StorefrontIcon sx={{ color: "white", fontSize: 22 }} />
                        </Box>
                        <Typography
                            variant="h6"
                            noWrap
                            component="div"
                            sx={{
                                display: { xs: "none", sm: "block" },
                                fontWeight: 700,
                                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            {import.meta.env.VITE_APP_TITLE}
                        </Typography>
                    </Box>
                    <SearchContainer>
                        <Search
                            sx={{
                                backgroundColor: "rgba(0, 0, 0, 0.04)",
                                borderRadius: "12px",
                                border: "1px solid transparent",
                                transition: "all 0.3s ease",
                                "&:hover": {
                                    backgroundColor: "rgba(0, 0, 0, 0.06)",
                                    border: "1px solid rgba(102, 126, 234, 0.3)",
                                },
                                "&:focus-within": {
                                    backgroundColor: "rgba(102, 126, 234, 0.08)",
                                    border: "1px solid #667eea",
                                    boxShadow: "0 0 0 3px rgba(102, 126, 234, 0.15)",
                                },
                            }}
                        >
                            <StyledInputBase
                                placeholder={t("appBar.searchPlaceholder")}
                                inputProps={{"aria-label": "search"}}
                                value={searchInput}
                                onChange={handleSearchInputChange}
                                onKeyDown={(e)=>{
                                    if (e.key === 'Enter') {
                                        e.preventDefault();             // 阻止任何默认行为（如换行或表单提交）
                                        handleSearch();                 // 直接复用点击搜索的逻辑
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
                                        color: "#667eea",
                                    },
                                }}
                            >
                                {isSearching ? (
                                    <CircularProgress size={20} color="inherit" />
                                ) : (
                                    <SearchIcon />
                                )}
                            </SearchIconWrapper>
                        </Search>
                    </SearchContainer>
                    <Box sx={{flexGrow: 1}}/>
                    <Box
                        sx={{
                            display: {xs: "none", md: "flex"},
                            alignItems: "center",
                            gap: 1,
                        }}
                    >
                        <LocaleSwitcher size="large" />
                        <IconButton
                            size="large"
                            aria-label="shopping cart"
                            color="inherit"
                            onClick={() => navigate({to: "/cart"})}
                            sx={{
                                "&:hover": {
                                    backgroundColor: "rgba(102, 126, 234, 0.1)",
                                },
                            }}
                        >
                            <Badge badgeContent={cartCount} color="error">
                                <ShoppingCartIcon/>
                            </Badge>
                        </IconButton>
                        {isLoggedIn() ? (
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
                                        backgroundColor: "rgba(102, 126, 234, 0.1)",
                                    },
                                }}
                            >
                                {userStore.account.avatar ? (
                                    <Avatar src={userStore.account.avatar} alt={userStore.account.name}/>
                                ) : (
                                    <AccountCircle/>
                                )}
                            </IconButton>
                        ) : (
                            <Button
                                variant="contained"
                                onClick={() => {
                                    window.location.href = getSigninUrl();
                                }}
                                sx={{
                                    ml: 2,
                                    borderRadius: "8px",
                                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                    boxShadow: "0 4px 12px rgba(102, 126, 234, 0.3)",
                                    "&:hover": {
                                        background: "linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%)",
                                    },
                                }}
                            >
                                {t("common:action.signIn")}
                            </Button>
                        )}
                    </Box>
                    <Box sx={{display: {xs: "flex", md: "none"}, alignItems: "center"}}>
                        <LocaleSwitcher size="small" />
                        {isLoggedIn() ? (
                            <IconButton
                                size="large"
                                aria-label="show more"
                                aria-controls={mobileMenuId}
                                aria-haspopup="true"
                                onClick={handleMobileMenuOpen}
                                color="inherit"
                            >
                                <MoreVertIcon/>
                            </IconButton>
                        ) : (
                            <Button
                                size="small"
                                onClick={() => {
                                    window.location.href = getSigninUrl();
                                }}
                                sx={{
                                    borderRadius: "8px",
                                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                    color: "white",
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
                                gridTemplateColumns: {xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)"},
                                gap: 2,
                            }}
                        >
                            {searchResults.map((product) => (
                                <Box
                                    key={product.id}
                                    sx={{
                                        border: "1px solid rgba(0, 0, 0, 0.08)",
                                        borderRadius: "12px",
                                        padding: 2,
                                        transition: "all 0.2s ease",
                                        "&:hover": {
                                            borderColor: "#667eea",
                                            boxShadow: "0 4px 20px rgba(102, 126, 234, 0.15)",
                                            transform: "translateY(-2px)",
                                        },
                                        cursor: "pointer",
                                    }}
                                    onClick={() => handleSearchResultClick(product)}
                                >
                                    <Box sx={{display: "flex", flexDirection: "column", alignItems: "center"}}>
                                        <Avatar
                                            src={product.mainMediaUrl}
                                            alt={product.name}
                                            sx={{
                                                width: 80,
                                                height: 80,
                                                mb: 2,
                                                borderRadius: "8px",
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
                                                fontWeight: 700,
                                                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                                WebkitBackgroundClip: "text",
                                                WebkitTextFillColor: "transparent",
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
                        <Typography variant="body1" sx={{textAlign: "center", py: 4}}>
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
