import { Code, ConnectError, createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { createFileRoute } from '@tanstack/react-router'
import cryptoJS from 'crypto-js'
import { type FormEvent, useEffect, useState } from 'react'
import { GreetService } from '@/gen/api/greet/v1/greet_pb'
import './index.css'

const transport = createConnectTransport({
	baseUrl: 'http://localhost:4000',
	// baseUrl: "http://my.app.com:4000",
})

const client = createClient(GreetService, transport)

export const Route = createFileRoute('/')({
	component: App,
})
type UserData = {
	token: string
	username: string
	expiresAt: Date
}
function App() {
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [email, setEmail] = useState('admin@example.com')
	const [isLoading, setIsLoading] = useState(false)
	const [loginStatus, setLoginStatus] = useState<'idle' | 'success' | 'error'>(
		'idle',
	)
	const [showManualLaunch, setShowManualLaunch] = useState(false)
	const [authToken, setAuthToken] = useState('')
	const [userData, setUserData] = useState<UserData | null>(null)
	const [isRegistering, setIsRegistering] = useState(false)

	// 检查本地存储中是否有认证信息
	useEffect(() => {
		const checkAuthStatus = () => {
			try {
				const storedAuthData = localStorage.getItem('authData')
				if (storedAuthData) {
					const authData = JSON.parse(storedAuthData)
					// 检查token是否过期
					if (authData.expiresAt && new Date(authData.expiresAt) > new Date()) {
						setUserData(authData)
						setLoginStatus('success')
					} else {
						// Token已过期，清除存储
						localStorage.removeItem('authData')
					}
				}
			} catch (error) {
				console.error('检查认证状态失败:', error)
			}
		}

		checkAuthStatus()
	}, [])

	// 获取认证挑战
	const getAuthChallenge = async (username: string) => {
		try {
			return await client.getAuthChallenge({ username })
		} catch (error) {
			console.error('获取认证挑战失败:', error)
			throw error
		}
	}

	// 计算密码哈希
	const hashPassword = (password: string, salt: string): string => {
		return cryptoJS.SHA256(salt + password + salt).toString(cryptoJS.enc.Hex)
	}

	// 计算挑战响应
	const computeChallengeResponse = (
		challenge: string,
		username: string,
	): string => {
		const timeWindow = Math.floor(Date.now() / 30000) // 30秒时间窗口
		const data = `${challenge}:${username}:${timeWindow}`
		return cryptoJS.SHA256(data).toString(cryptoJS.enc.Hex)
	}

	// 注册新用户
	const registerUser = async (
		username: string,
		password: string,
		email: string,
	) => {
		// 生成随机盐值
		const salt = cryptoJS.lib.WordArray.random(16).toString()
		const passwordHash = hashPassword(password, salt)
		// 调用注册API
		return await client.register({
			username,
			passwordHash,
			email,
			salt,
		})
	}

	// 尝试唤起桌面应用的函数
	const launchDesktopApp = (authToken: string, username: string) => {
		const appDeepLink = `desktop-connect-login-example://auth-success?token=${encodeURIComponent(authToken)}&username=${encodeURIComponent(username)}&state=authenticated`
		console.log('尝试唤起桌面应用:', appDeepLink)

		// 方法1: 使用 window.location
		try {
			window.location.href = appDeepLink
		} catch (e) {
			console.log('window.location 方法失败:', e)
		}

		// 方法2: 使用 iframe (备用)
		setTimeout(() => {
			const iframe = document.createElement('iframe')
			iframe.style.display = 'none'
			iframe.src = appDeepLink
			document.body.appendChild(iframe)

			setTimeout(() => {
				document.body.removeChild(iframe)
				checkIfAppLaunched()
			}, 500)
		}, 100)

		// 检测应用是否成功唤起
		const checkIfAppLaunched = () => {
			setTimeout(() => {
				if (document.hasFocus()) {
					console.log('可能未检测到桌面应用，提供手动链接')
					setShowManualLaunch(true)
				}
			}, 1500)
		}
	}

	const handleManualLaunch = () => {
		const appDeepLink = `desktop-connect-login-example://auth-success?token=${encodeURIComponent(authToken)}&username=${encodeURIComponent(username)}&state=authenticated`
		window.open(appDeepLink, '_blank')
	}

	// 处理登出
	const handleLogout = () => {
		localStorage.removeItem('authData')
		setUserData(null)
		setLoginStatus('idle')
	}

	// 处理登录表单提交
	const handleLoginSubmit = async (e: FormEvent) => {
		e.preventDefault()
		setIsLoading(true)
		setLoginStatus('idle')

		try {
			console.log('开始认证流程，用户名:', username)

			// 1. 获取认证挑战
			const challengeRes = await getAuthChallenge(username)
			const { challenge, salt } = challengeRes
			console.log('收到挑战:', challenge, '盐值:', salt)

			// 2. 计算密码哈希和挑战响应
			const hashedPassword = hashPassword(password, salt)
			const challengeResponse = computeChallengeResponse(challenge, username)
			console.log(
				'计算出的哈希密码:',
				hashedPassword,
				'挑战响应:',
				challengeResponse,
			)

			// 3. 提交认证请求
			const res = await client.submitAuth({
				username: username,
				hashedCredential: hashedPassword,
				authRequestId: Math.random().toString(36).substring(2),
				challengeResponse: challengeResponse,
			})

			console.log('认证响应:', res)

			// 认证成功
			if (res.code === 'success' && res.state === 'authenticated') {
				setLoginStatus('success')

				// 使用服务端返回的JWT令牌
				const authToken =
					res.authToken ||
					`jwt_${Date.now()}_${Math.random().toString(36).substring(2)}`
				setAuthToken(authToken)

				// 存储认证信息到本地
				const authData = {
					token: authToken,
					username: username,
					expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24小时后过期
				}
				localStorage.setItem('authData', JSON.stringify(authData))
				setUserData(authData)

				// 登录成功，尝试唤起桌面应用
				launchDesktopApp(authToken, username)
			} else {
				setLoginStatus('error')
			}
		} catch (error) {
			console.error('登录错误:', error)
			setLoginStatus('error')
		} finally {
			setIsLoading(false)
		}
	}

	// 处理注册表单提交
	const handleRegisterSubmit = async (e: FormEvent) => {
		e.preventDefault()

		// 验证密码确认
		if (password !== confirmPassword) {
			alert('密码确认不匹配')
			return
		}

		setIsLoading(true)

		try {
			console.log('开始注册流程，用户名:', username)

			// 调用注册API
			const response = await registerUser(username, password, email)
			console.log('注册响应:', response)

			// 注册成功后切换到登录状态
			alert('注册成功，请登录')
			setIsRegistering(false)
			setPassword('')
			setConfirmPassword('')
		} catch (error) {
			// 判断错误是否为 ConnectError
			if (error instanceof ConnectError) {
				// 根据后端的错误码来决定给用户的提示
				switch (error.code) {
					case Code.AlreadyExists:
						// 用户名或邮箱已存在
						console.error('注册失败: 用户已存在', error.rawMessage)
						// 可以在这里更新UI，例如： setFormError("用户名或邮箱已被占用");
						throw new Error('用户名或邮箱已被占用。')

					case Code.InvalidArgument:
						// 输入参数无效
						console.error('注册失败: 输入无效', error.rawMessage)
						throw new Error('请检查您输入的用户名和邮箱格式是否正确。')
					default:
						// 处理其他所有来自服务器的错误（例如 Code.Internal）
						console.error('注册失败: 服务器发生未知错误', error)
						throw new Error('注册服务暂时不可用，请稍后再试。')
				}
			} else {
				// 处理非 Connect 协议的错误（例如网络中断）
				console.error('注册失败: 发生网络或未知客户端错误', error)
				throw new Error('网络连接失败，请检查您的网络设置。')
			}
		} finally {
			setIsLoading(false)
		}
	}

	// 如果已登录，显示用户信息
	if (loginStatus === 'success' && userData) {
		return (
			<div className='login-container'>
				<div className='login-card'>
					<h2>登录成功</h2>
					<div className='user-info'>
						<p>欢迎, {userData.username}!</p>
						<p>您已成功登录。</p>
						<p>Token: {userData.token.substring(0, 20)}...</p>
						<p>过期时间: {new Date(userData.expiresAt).toLocaleString()}</p>
					</div>
					<button
						type='button'
						onClick={handleLogout}
						className='logout-button'
					>
						退出登录
					</button>
				</div>
			</div>
		)
	}

	// 注册表单
	if (isRegistering) {
		return (
			<div className='login-container'>
				<div className='login-card'>
					<h2>用户注册</h2>
					<p className='login-description'>创建新账户</p>

					<form onSubmit={handleRegisterSubmit}>
						<div className='input-group'>
							<label htmlFor='username'>
								用户名
								<input
									type='text'
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									placeholder='请输入用户名'
									required
									disabled={isLoading}
								/>
							</label>
						</div>
						<div className='input-group'>
							<label htmlFor='email'>
								邮箱
								<input
									type='email'
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder='请输入邮箱'
									required
									disabled={isLoading}
								/>
							</label>
						</div>

						<div className='input-group'>
							<label htmlFor='password'>
								密码
								<input
									type='password'
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder='请输入密码'
									required
									disabled={isLoading}
								/>
							</label>
						</div>

						<div className='input-group'>
							<label htmlFor='confirmPassword'>
								确认密码
								<input
									type='password'
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									placeholder='请再次输入密码'
									required
									disabled={isLoading}
								/>
							</label>
						</div>

						<button
							type='submit'
							disabled={isLoading}
							className={isLoading ? 'loading' : ''}
						>
							{isLoading ? '注册中...' : '注册'}
						</button>
					</form>

					<div className='switch-form'>
						<p>
							已有账户?{' '}
							<button
								type='button'
								onClick={() => setIsRegistering(false)}
								className='link-button'
							>
								登录
							</button>
						</p>
					</div>
				</div>
			</div>
		)
	}

	// 登录表单
	return (
		<div className='login-container'>
			<div className='login-card'>
				<h2>用户登录</h2>
				<p className='login-description'>登录成功后，将自动唤起桌面应用程序</p>

				<form onSubmit={handleLoginSubmit}>
					<div className='input-group'>
						<label htmlFor='username'>
							用户名
							<input
								type='text'
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								placeholder='请输入用户名'
								required
								disabled={isLoading}
							/>
						</label>
					</div>

					<div className='input-group'>
						<label htmlFor='password'>
							密码
							<input
								type='password'
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder='请输入密码'
								required
								disabled={isLoading}
							/>
						</label>
					</div>

					<button
						type='submit'
						disabled={isLoading}
						className={isLoading ? 'loading' : ''}
					>
						{isLoading ? '登录中...' : '登录'}
					</button>
				</form>

				<div className='switch-form'>
					<p>
						没有账户?{' '}
						<button
							type='button'
							onClick={() => setIsRegistering(true)}
							className='link-button'
						>
							注册
						</button>
					</p>
				</div>

				{loginStatus === 'success' && (
					<div className='status-message success'>
						<h3>登录成功！</h3>
						<p>请点击下方按钮以打开桌面应用并完成认证。</p>
						<button
							type='button'
							onClick={handleManualLaunch}
							className='launch-button'
						>
							打开桌面应用
						</button>
					</div>
				)}

				{loginStatus === 'error' && (
					<div className='status-message error'>
						<h3>登录失败</h3>
						<p>用户名或密码不正确，请重试</p>
					</div>
				)}

				{showManualLaunch && (
					<div className='manual-launch-prompt'>
						<h3>未成功唤起应用？</h3>
						<p>请点击下方链接手动打开桌面应用</p>
						<button
							type='button'
							onClick={handleManualLaunch}
							className='launch-button'
						>
							打开桌面应用
						</button>
						<p className='small-text'>
							如果点击后没有反应，请确保您已安装桌面应用，
							或者联系技术支持获取帮助。
						</p>
					</div>
				)}
			</div>
		</div>
	)
}
