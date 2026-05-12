import AccountCircle from "@mui/icons-material/AccountCircle";
import MailIcon from "@mui/icons-material/Mail";
import MenuIcon from "@mui/icons-material/Menu";
import MoreIcon from "@mui/icons-material/MoreVert";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SearchIcon from "@mui/icons-material/Search";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import { getSigninUrl, isLoggedIn } from "@ecommerce/configs";
import { SEARCH_INDEX } from "@ecommerce/constants";
import type { Product } from "@/gen/api";
import { addNotification } from "@/store/notifications";
import { userStore } from "@/store/users";
import { clearToken } from "@ecommerce/utils";

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
                message: "登出成功",
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
                    Signed in as {userStore.account.name || userStore.account.email}
                </Typography>
            </MenuItem>
            <MenuItem onClick={() => handleMenuClose("/profile")}>My account</MenuItem>
            <MenuItem onClick={() => handleMenuClose("/logout")}>Logout</MenuItem>
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
            <MenuItem>
                <IconButton size="large" aria-label="show 4 new mails" color="inherit">
                    <Badge badgeContent={4} color="error">
                        <MailIcon/>
                    </Badge>
                </IconButton>
                <p>Messages</p>
            </MenuItem>
            <MenuItem>
                <IconButton size="large" aria-label="show 17 new notifications" color="inherit">
                    <Badge badgeContent={17} color="error">
                        <NotificationsIcon/>
                    </Badge>
                </IconButton>
                <p>Notifications</p>
            </MenuItem>
            <MenuItem>
                <IconButton
                    size="large"
                    aria-label="shopping cart"
                    color="inherit"
                    onClick={() => navigate({to: "/cart"})}
                >
                    <Badge badgeContent={3} color="error">
                        <ShoppingCartIcon/>
                    </Badge>
                </IconButton>
                <p>Cart</p>
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
                <p>Profile</p>
            </MenuItem>
        </Menu>
    );

    return (
        <Box sx={{flexGrow: 1}}>
            <StyledAppBar position="static">
                <Toolbar sx={{
                    color: 'black'
                }}>
                    <IconButton
                        size="large"
                        edge="start"
                        color="inherit"
                        aria-label="open drawer"
                        sx={{mr: 2}}
                    >
                        <MenuIcon/>
                    </IconButton>
                    <Typography
                        variant="h6"
                        noWrap
                        component="div"
                        sx={{display: {xs: "none", sm: "block"}}}
                    >
                        {import.meta.env.VITE_APP_TITLE}
                    </Typography>
                    <SearchContainer>
                        <Search
                            sx={{
                                border: '1px solid black',
                            }}
                        >
                            <StyledInputBase
                                placeholder="Search…"
                                inputProps={{"aria-label": "search"}}
                                value={searchInput}
                                onChange={handleSearchInputChange}
                            />
                            <SearchIconWrapper onClick={handleSearch}>
                                <SearchIcon/>
                            </SearchIconWrapper>
                        </Search>
                    </SearchContainer>
                    <Box sx={{flexGrow: 1}}/>
                    <Box
                        sx={{
                            display: {xs: "none", md: "flex"},
                            alignItems: "center",
                            gap: 2,
                        }}
                    >
                        <IconButton size="large" aria-label="show 4 new mails" color="inherit">
                            <Badge badgeContent={4} color="error">
                                <MailIcon/>
                            </Badge>
                        </IconButton>
                        <IconButton size="large" aria-label="show 17 new notifications" color="inherit">
                            <Badge badgeContent={17} color="error">
                                <NotificationsIcon/>
                            </Badge>
                        </IconButton>
                        <IconButton
                            size="large"
                            aria-label="shopping cart"
                            color="inherit"
                            onClick={() => navigate({to: "/cart"})}
                        >
                            <Badge badgeContent={3} color="error">
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
                                sx={{ml: 2}}
                            >
                                Login
                            </Button>
                        )}
                    </Box>
                    <Box sx={{display: {xs: "flex", md: "none"}}}>
                        {isLoggedIn() ? (
                            <IconButton
                                size="large"
                                aria-label="show more"
                                aria-controls={mobileMenuId}
                                aria-haspopup="true"
                                onClick={handleMobileMenuOpen}
                                color="inherit"
                            >
                                <MoreIcon/>
                            </IconButton>
                        ) : (
                            <Button
                                size="small"
                                onClick={() => {
                                    window.location.href = getSigninUrl();
                                }}
                            >
                                Login
                            </Button>
                        )}
                    </Box>
                </Toolbar>
            </StyledAppBar>
            {showSearchResults && (
                <SearchResults>
                    <Typography variant="h6" gutterBottom>
                        搜索结果
                    </Typography>
                    {isSearching ? (
                        <Typography variant="body1" sx={{textAlign: "center", py: 4}}>
                            搜索中...
                        </Typography>
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
                                        border: "1px solid rgba(0, 0, 0, 0.1)",
                                        borderRadius: 1,
                                        padding: 2,
                                        "&:hover": {
                                            boxShadow: 2,
                                            backgroundColor: "rgba(0, 0, 0, 0.02)",
                                        },
                                        cursor: "pointer",
                                    }}
                                    onClick={() => handleSearchResultClick(product)}
                                >
                                    <Box sx={{display: "flex", flexDirection: "column", alignItems: "center"}}>
                                        <Avatar
                                            src={product.mainMediaUrl}
                                            alt={product.name}
                                            sx={{width: 80, height: 80, mb: 2}}
                                        />
                                        <Typography variant="subtitle1" gutterBottom textAlign="center">
                                            {product.name}
                                        </Typography>
                                        <Typography variant="body1" color="primary" fontWeight="bold">
                                            ¥{product.price}
                                        </Typography>
                                        <Typography variant="body1" color="primary" fontWeight="bold">
                                            已售{product.quantity}
                                        </Typography>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    ) : (
                        <Typography variant="body1" sx={{textAlign: "center", py: 4}}>
                            未找到相关商品
                        </Typography>
                    )}
                </SearchResults>
            )}
            {renderMobileMenu}
            {renderMenu}
        </Box>
    );
}
