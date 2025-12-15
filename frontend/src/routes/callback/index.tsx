import CheckIcon from '@mui/icons-material/Check'
import { CircularProgress } from '@mui/material'
import Alert from '@mui/material/Alert'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { signIn } from '@/api/users.ts'
import type { Status } from '@/constants/status.ts'
import { addNotification } from '@/store/notifications'
import { setAccount } from "@/store/users.ts";
import { setToken } from '@/utils/casdoor'

const CallbackSearchSchema = z.object({
	code: z.string().min(1, '缺少 code 参数'),
	state: z.string().min(1, '缺少 state 参数'),
})

export const Route = createFileRoute('/callback/')({
	component: RouteComponent,
	validateSearch: CallbackSearchSchema,
})

function RouteComponent() {
	const [status, setStatus] = useState<Status>('loading')
	// 使用 useRef 防止 React.StrictMode 下 useEffect 执行两次导致 code 失效
	const processedRef = useRef(false)
	const { code, state } = Route.useSearch()
	const navigate = useNavigate()

	useEffect(() => {
		// 防止重复提交
		if (processedRef.current) return
		processedRef.current = true

		const handleLogin = async () => {
			try {
				const response = await signIn(code, state)

				if (response.state === 'ok' && response.data) {
					setToken(response.data)
					setStatus('success')
					// 添加登录成功通知
					addNotification({
						message: '登录成功',
						severity: 'success',
					})
					// 重定向到首页
					await navigate({ to: '/' })
				} else {
					setStatus('error')
					// 添加登录失败通知
					addNotification({
						message: '登录失败',
						severity: 'error',
					})
					// 重定向到首页
					await navigate({ to: '/' })
				}
			} catch (err) {
				setStatus('error')
				console.error('RPC 调用错误:', err)
				// 添加登录失败通知
				addNotification({
					message: '登录失败，请重试',
					severity: 'error',
				})
				// 重定向到首页
				await navigate({ to: '/' })
			}
		}

		handleLogin()
	}, [code, state, navigate])

	const render = () => {
		switch (status) {
			case 'success':
				return (
					<Alert
						icon={<CheckIcon fontSize='inherit' />}
						severity='success'
					>
						登录成功，正在跳转到首页...
					</Alert>
				)
			case 'error':
				return <Alert severity='error'>登录失败，正在跳转到首页...</Alert>
			case 'loading':
				return <CircularProgress />
		}
	}

	return <>{render()}</>
}
