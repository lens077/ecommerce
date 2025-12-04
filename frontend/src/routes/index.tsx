import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import './index.css'
import { goToLink, getSigninUrl } from '@/conf/casdoor.ts'

export const Route = createFileRoute('/')({
    component: App,
})
type UserData = {
    token: string
    username: string
    expiresAt: Date
}

function App() {
    const [loginStatus, setLoginStatus] = useState<'idle' | 'success' | 'error'>(
        'idle',
    )
    const [userData, setUserData] = useState<UserData | null>(null)

    // 处理登出
    const handleLogout = () => {
        localStorage.removeItem('authData')
        setUserData(null)
        setLoginStatus('idle')
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

    // 登录表单
    return (
        <div className='login-container'>
            <div className='login-card'>
                <h2>用户登录</h2>
                <p className='login-description'>登录成功后，将自动唤起桌面应用程序</p>

                <div className='switch-form'>
                    <button type="button"
                            onClick={() => goToLink(getSigninUrl())}
                    >注册/登录
                    </button>
                </div>

                {loginStatus === 'error' && (
                    <div className='status-message error'>
                        <h3>登录失败</h3>
                        <p>用户名或密码不正确，请重试</p>
                    </div>
                )}
            </div>
        </div>
    )
}
