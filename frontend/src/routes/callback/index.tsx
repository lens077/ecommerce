import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router' // 假设你使用 react-router-dom
import { setToken, showMessage } from '@/utils/casdoor'
import { createClient } from "@connectrpc/connect"
import { UserService } from "@/gen/api/user/user_pb.ts"
import { createConnectTransport } from "@connectrpc/connect-web"

export const Route = createFileRoute('/callback/')({
    component: RouteComponent,
})

function RouteComponent() {
    const navigate = useNavigate()
    // 使用 useRef 防止 React.StrictMode 下 useEffect 执行两次导致 code 失效
    const processedRef = useRef(false)

    useEffect(() => {
        // 1. 获取 URL 中的 code 和 state
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        const state = params.get('state')

        // // 如果没有参数，跳转回首页或登录页
        // if (!code || !state) {
        //     showMessage("无效的回调参数")
        //     navigate('/').then(r => {
        //         console.log("无效的回调参数")
        //     })
        //     return
        // }

        // 防止重复提交
        if (processedRef.current) return
        processedRef.current = true

        const handleLogin = async () => {
            try {
                console.log("正在使用 ConnectRPC 登录...", {code, state})
                
                // 如果没有参数，跳转回首页或登录页
                if (!code || !state) {
                    showMessage("无效的回调参数")
                    await navigate({ to: '/' })
                    return
                }
                
                const transport = createConnectTransport({
                    baseUrl: 'http://localhost:4000',
                    // baseUrl: "http://my.app.com:4000",
                })

                const client = createClient(UserService, transport)

                // 2. 调用 ConnectRPC 的 SignIn 方法
                const response = await client.signIn({
                    code: code,
                    state: state,
                })

                console.log("RPC 登录成功:", response)

                // 3. 处理响应
                // 你的后端 proto 定义: string state = 1 string data = 2 (data 是 token)
                if (response.state === "ok" && response.data) {
                    setToken(response.data) // 保存 token
                    showMessage("登录成功")
                    await navigate({ to: '/' }) // 跳转回首页
                } else {
                    showMessage(`登录失败: 状态不正确 (${response.state})`)
                    await navigate({ to: '/' })
                }
            } catch (err) {
                console.error("RPC 调用错误:", err)
                // Connect 的错误通常包含 rawMessage
                const errorMsg = (err as any).rawMessage || "登录过程中发生未知错误"
                showMessage(errorMsg)
                await navigate({ to: '/' })
            }
        }

        handleLogin()

    }, [navigate])

    return (
        <div style={{textAlign: 'center', marginTop: '100px'}}>
            <h3>正在登录验证中...</h3>
            <p>请稍候，正在连接服务器进行身份交换。</p>
        </div>
    )
}


