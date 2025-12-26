import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSnapshot } from 'valtio'
import { getUserProfile } from '@/api/users.ts'
import { addNotification } from '@/store/notifications.ts'
import { setAccount, userStore } from '@/store/users.ts'
import { isTokenExpired } from '@/utils/jwt.ts'

export const Route = createFileRoute('/profile/')({
	component: RouteComponent,
	// 校验token是否过期，过期则重定向到首页
	beforeLoad: ({ location }) => {
		const token = localStorage.getItem('token')
		if (isTokenExpired(typeof token === 'string' ? token : '')) {
			console.warn('Token已过期，请重新登录或尝试刷新。')

			addNotification({
				message: 'Token已过期，请重新登录或尝试刷新。即将回到首页',
				severity: 'warning',
			})

			setAccount({})
			localStorage.removeItem('token')

			throw redirect({
				to: '/',
				search: { redirect: location.href },
			})
		}
	},
})

function RouteComponent() {
	const userProfileSnap = useSnapshot(userStore)
	const { data, isLoading, error } = useQuery({
		queryKey: ['getUserProfile'],
		queryFn: async () => {
			const res = await getUserProfile()
			if (res.user) {
				setAccount(res.user)
			}
			return res
		},
	})
	if (isLoading) return <div>加载中...</div>
	if (error) return <div>加载失败，请重试</div>

	const userProfile = data?.user || userProfileSnap.account

	return (
		<div>
			<ol>
				{
					<li>
						id：{userProfile.id}
						用户名：{userProfile.name}
						昵称：{userProfile.displayName}
						<img
							src={userProfile.avatar}
							alt=''
						/>
						邮箱：{userProfile.email}
						账号创建日期：{userProfile.createdTime}
						tag：{userProfile.tag}
					</li>
				}
			</ol>
		</div>
	)
}
