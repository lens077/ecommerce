import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { setToken } from '@/utils/casdoor'
import Alert from '@mui/material/Alert';
import CheckIcon from '@mui/icons-material/Check';
import { z } from "zod";
import { CircularProgress } from "@mui/material";
import { userClient } from "@/api/client.ts";
import type { Status } from "@/constants/status.ts";

const CallbackSearchSchema = z.object({
    code: z.string().min(1, "缺少 code 参数"),
    state: z.string().min(1, "缺少 state 参数"),
});

export const Route = createFileRoute('/callback/')({
    component: RouteComponent,
    validateSearch: CallbackSearchSchema
})

function RouteComponent() {
    const [status, setStatus] = useState<Status>('loading')
    // 使用 useRef 防止 React.StrictMode 下 useEffect 执行两次导致 code 失效
    const processedRef = useRef(false)
    const {code, state} = Route.useSearch()

    useEffect(() => {
        // 防止重复提交
        if (processedRef.current) return
        processedRef.current = true

        const handleLogin = async () => {
            try {
                const response = await userClient.signIn({
                    code: code,
                    state: state,
                })

                if (response.state === "ok" && response.data) {
                    setToken(response.data)
                    setStatus('success')
                } else {
                    setStatus('error')
                }
            } catch (err) {
                setStatus('error')
                console.error("RPC 调用错误:", err)
            }
        }

        handleLogin()

    }, [code, state])

    const render = () => {
        switch (status) {
            case "success":
                return <Alert icon={<CheckIcon fontSize="inherit"/>} severity="success">
                    登录成功
                </Alert>
            case "error":
                return <Alert severity="error">登录失败</Alert>
            case "loading":
                return <CircularProgress/>
        }
    }

    return (<>
            {render()}
        </>
    )
}


