import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { getUserProfile } from '@/api/users.ts'
import { addNotification } from '@/store/notifications.ts'
import { setAccount, userStore } from '@/store/users.ts'
import { isTokenExpired } from '@/utils/jwt.ts'

export const Route = createFileRoute('/profile/')({
	component: RouteComponent,
})

function RouteComponent() {
	const userProfile = useSnapshot(userStore)
	const navigate = useNavigate()
	useEffect(() => {
		const token = localStorage.getItem('token')
		if (isTokenExpired(typeof token === 'string' ? token : '')) {
			console.warn('Token已过期，请重新登录或尝试刷新。')

			addNotification({
				message: 'Token已过期，请重新登录或尝试刷新。即将回到首页',
				severity: 'warning',
			})

			setAccount({})
			localStorage.removeItem("token")

			const timerId = setTimeout(() => {
				// 跳转到首页
				navigate({
					to: '/',
				})
			}, 3 * 1000)
			return () => {
				clearTimeout(timerId)
			}
		}

		const userProfile = getUserProfile()
		userProfile
			.then((data) => {
				if (data.user !== undefined) {
					setAccount(data.user)
				}
			})
			.catch((err) => {
				console.error(err)
			})
	}, [navigate])
	return (
		<div>
			<ol>
				{
					<li>
						id：{userProfile.account.id}
						用户名：{userProfile.account.name}
						昵称：{userProfile.account.displayName}
						<img
							src={userProfile.account.avatar}
							alt=''
						/>
						邮箱：{userProfile.account.email}
						账号创建日期：{userProfile.account.createdTime}
						tag：{userProfile.account.tag}
					</li>
				}
			</ol>
		</div>
	)
}
