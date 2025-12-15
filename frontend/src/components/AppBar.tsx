import AccountCircle from '@mui/icons-material/AccountCircle'
import MailIcon from '@mui/icons-material/Mail'
import MenuIcon from '@mui/icons-material/Menu'
import MoreIcon from '@mui/icons-material/MoreVert'
import NotificationsIcon from '@mui/icons-material/Notifications'
import SearchIcon from '@mui/icons-material/Search'
import { Button } from '@mui/material'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { alpha, styled } from '@mui/material/styles'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { useNavigate } from '@tanstack/react-router'
import { type MouseEvent, useState } from 'react'
import { search } from '@/api/search.ts'
import { getSigninUrl, isLoggedIn } from '@/conf/casdoor.ts'
import type { Product } from '@/gen/api/search/v1/search_pb.ts'
import { addNotification } from '@/store/notifications'
import { userStore } from '@/store/users.ts'
import { clearToken } from '@/utils/casdoor'

const Search = styled('div')(({ theme }) => ({
	position: 'relative',
	borderRadius: theme.shape.borderRadius,
	backgroundColor: alpha(theme.palette.common.white, 0.15),
	'&:hover': {
		backgroundColor: alpha(theme.palette.common.white, 0.25),
	},
	marginRight: theme.spacing(2),
	marginLeft: 0,
	width: '100%',
	[theme.breakpoints.up('sm')]: {
		marginLeft: theme.spacing(3),
		width: 'auto',
	},
}))

const SearchIconWrapper = styled('div')(({ theme }) => ({
	padding: theme.spacing(0, 2),
	height: '100%',
	position: 'absolute',
	pointerEvents: 'none',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
}))

const StyledInputBase = styled(InputBase)(({ theme }) => ({
	color: 'inherit',
	'& .MuiInputBase-input': {
		padding: theme.spacing(1, 1, 1, 0),
		// vertical padding + font size from searchIcon
		paddingLeft: `calc(1em + ${theme.spacing(4)})`,
		transition: theme.transitions.create('width'),
		width: '100%',
		[theme.breakpoints.up('md')]: {
			width: '20ch',
		},
	},
}))

export default function PrimarySearchAppBar() {
	const [products, setProducts] = useState<Product[]>([])
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
	const [mobileMoreAnchorEl, setMobileMoreAnchorEl] =
		useState<null | HTMLElement>(null)
	const navigate = useNavigate()

	const searchKey = async (index: string, name: string) => {
		try {
			console.log(index, name)
			const response = await search(index, name)
			console.log('API Response:', response)

			if (response.products && Array.isArray(response.products)) {
				setProducts(response.products)
			} else {
				console.warn('响应中没有 products 数组:', response)
				setProducts([])
			}
		} catch (error) {
			console.error('获取产品失败:', error)
			setProducts([])
		}
	}

	const isMenuOpen = Boolean(anchorEl)
	const isMobileMenuOpen = Boolean(mobileMoreAnchorEl)

	const handleProfileMenuOpen = (event: MouseEvent<HTMLElement>) => {
		setAnchorEl(event.currentTarget)
	}

	const handleMobileMenuClose = () => {
		setMobileMoreAnchorEl(null)
	}

	const handleMenuClose = async (path?: string) => {
			setAnchorEl(null)
			handleMobileMenuClose()

			if (path === '/logout') {
				// 执行登出操作
				clearToken()
				// 清空用户store
				userStore.account = {
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
					avatar: ""
				}
				// 显示登出成功通知
				addNotification({
					message: '登出成功',
					severity: 'success'
				})
				// 跳转到首页
				await navigate({
					to: '/',
				})
			} else if (path) {
				await navigate({
					to: path,
				})
			}
		}

	const handleMobileMenuOpen = (event: MouseEvent<HTMLElement>) => {
		setMobileMoreAnchorEl(event.currentTarget)
	}

	const menuId = 'primary-search-account-menu'
	const renderMenu = (
		<Menu
			anchorEl={anchorEl}
			anchorOrigin={{
				vertical: 'top',
				horizontal: 'right',
			}}
			id={menuId}
			keepMounted
			transformOrigin={{
				vertical: 'top',
				horizontal: 'right',
			}}
			open={isMenuOpen}
			onClose={() => handleMenuClose()}
		>
			<MenuItem disabled>
					<Typography
						variant='body2'
						color='text.secondary'
					>
						Signed in as {userStore.account.name || userStore.account.email}
					</Typography>
				</MenuItem>
			<MenuItem onClick={() => handleMenuClose('/profile')}>
				My account
			</MenuItem>
			<MenuItem onClick={() => handleMenuClose('/logout')}>Logout</MenuItem>
		</Menu>
	)

	const mobileMenuId = 'primary-search-account-menu-mobile'
	const renderMobileMenu = (
		<Menu
			anchorEl={mobileMoreAnchorEl}
			anchorOrigin={{
				vertical: 'top',
				horizontal: 'right',
			}}
			id={mobileMenuId}
			keepMounted
			transformOrigin={{
				vertical: 'top',
				horizontal: 'right',
			}}
			open={isMobileMenuOpen}
			onClose={handleMobileMenuClose}
		>
			<MenuItem>
				<IconButton
					size='large'
					aria-label='show 4 new mails'
					color='inherit'
				>
					<Badge
						badgeContent={4}
						color='error'
					>
						<MailIcon />
					</Badge>
				</IconButton>
				<p>Messages</p>
			</MenuItem>
			<MenuItem>
				<IconButton
					size='large'
					aria-label='show 17 new notifications'
					color='inherit'
				>
					<Badge
						badgeContent={17}
						color='error'
					>
						<NotificationsIcon />
					</Badge>
				</IconButton>
				<p>Notifications</p>
			</MenuItem>
			<MenuItem onClick={handleProfileMenuOpen}>
				<IconButton
					size='large'
					aria-label='account of current user'
					aria-controls='primary-search-account-menu'
					aria-haspopup='true'
					color='inherit'
				>
					{userStore.account.avatar ? (
						<Avatar
							src={userStore.account.avatar}
							alt={userStore.account.name}
						/>
					) : (
						<AccountCircle />
					)}
				</IconButton>
				<p>Profile</p>
			</MenuItem>
		</Menu>
	)

	return (
		<Box sx={{ flexGrow: 1 }}>
			<AppBar position='static'>
				<Toolbar>
					<IconButton
						size='large'
						edge='start'
						color='inherit'
						aria-label='open drawer'
						sx={{ mr: 2 }}
					>
						<MenuIcon />
					</IconButton>
					<Typography
						variant='h6'
						noWrap
						component='div'
						sx={{ display: { xs: 'none', sm: 'block' } }}
					>
						{import.meta.env.VITE_APP_TITLE}
					</Typography>
					<Search>
						<SearchIconWrapper>
							<SearchIcon />
						</SearchIconWrapper>
						<StyledInputBase
							onKeyUp={(e) => {
								const keyword = e.currentTarget.value.trim()
								if (e.key === 'Enter' && keyword.trim().length > 0) {
									searchKey('products', keyword)
								}
							}}
							placeholder='Search…'
							inputProps={{ 'aria-label': 'search' }}
						/>
					</Search>
					<Box sx={{ flexGrow: 1 }} />
			<Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 2 }}>
				<IconButton
					size='large'
					aria-label='show 4 new mails'
					color='inherit'
				>
					<Badge
						badgeContent={4}
						color='error'
					>
						<MailIcon />
					</Badge>
				</IconButton>
				<IconButton
					size='large'
					aria-label='show 17 new notifications'
					color='inherit'
				>
					<Badge
						badgeContent={17}
						color='error'
					>
						<NotificationsIcon />
					</Badge>
				</IconButton>
				{isLoggedIn() ? (
					<IconButton
						size='large'
						edge='end'
						aria-label='account of current user'
						aria-controls={menuId}
						aria-haspopup='true'
						onClick={handleProfileMenuOpen}
						color='inherit'
					>
						{userStore.account.avatar ? (
							<Avatar
								src={userStore.account.avatar}
								alt={userStore.account.name}
							/>
						) : (
							<AccountCircle />
						)}
					</IconButton>
				) : (
					<Button
						variant='contained'
						onClick={() => {
							window.location.href = getSigninUrl()
						}}
						sx={{ ml: 2 }}
					>
						Login
					</Button>
				)}
			</Box>
			<Box sx={{ display: { xs: 'flex', md: 'none' } }}>
				{isLoggedIn() ? (
					<IconButton
						size='large'
						aria-label='show more'
						aria-controls={mobileMenuId}
						aria-haspopup='true'
						onClick={handleMobileMenuOpen}
						color='inherit'
					>
						<MoreIcon />
					</IconButton>
				) : (
					<Button
						size='small'
						onClick={() => {
							window.location.href = getSigninUrl()
						}}
					>
						Login
					</Button>
				)}
			</Box>
				</Toolbar>
			</AppBar>
			{renderMobileMenu}
		{renderMenu}
		{/* 产品列表渲染 */}
		<div style={{ marginTop: '20px' }}>
				<h3>搜索结果 ({products.length} 个产品):</h3>

				{products.length === 0 ? (
					<p>没有找到产品</p>
				) : (
					<ol>
						{products.map((item: Product) => (
							<li
								key={item.id}
								style={{
									marginBottom: '15px',
									padding: '10px',
									border: '1px solid #ddd',
								}}
							>
								<strong>产品名称:</strong> {item.name}
								<br />
								<strong>价格:</strong> {item.price}
								<br />
								<strong>描述:</strong> {item.description}
								<br />
								<strong>状态:</strong> {item.status}
								<br />
								<strong>商家ID:</strong> {item.merchantId}
								<br />
								<strong>分类:</strong> {item.categoryName}
							</li>
						))}
					</ol>
				)}
			</div>
		</Box>
	)
}
