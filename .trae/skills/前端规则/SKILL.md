---
name: 前端规则
description: 编写前端代码时
---

电商项目前端
项目目录方面， 如果是在很多地方都使用的通用的模板组件，创建layouts存放，如果是某个页面的排版组件，把它们存放在一个有意义的名称目录里

使用Vite最新版作为脚手架， 优先使用package.json已有的库

在前端框架选择上, 使用react 19.2.3和typescript版本以上,最新即可

UI方面, 使用@mui/material 组件, 不使用tailwindcss和postcss， 使用@mui/material 的sx属性来编写css，如果需要编写跨类等css等sx属性满足不了的功能， 在当前组件目录下创建scss文件并编写，否则一律使用使用@mui/material 的sx属性来编写css

图标方面,使用@mui/icons-material 

在需要验证, 校验的数据中, 使用zod来

在通信库方面使用@bufbuild/protobuf和@connectrpc/connect和@connectrpc/connect-web与搭配@tanstack/react-query来处理和后端connect-go的通信

在网络API调用方面，创建api目录并存放所有的api文件,由需要使用的调用方来引用， 其api接口文件结构如下：
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { SearchService } from '@/gen/api/search/v1/search_pb'

const transport = createConnectTransport({
	baseUrl: `${import.meta.env.VITE_BASE_URL}/search`,
	// baseUrl: `/api/search`,
})

const client = createClient(SearchService, transport)

export const search = (index: string, name: string) => {
	return client.search({
		index,
		name,
	})
}
一个调用方的例子：
const handleLogin = async () => {
			try {
				const response = await signIn(code, state)

				if (response.state === 'ok' && response.data) {
					setToken(response.data)
					setStatus('success')
					if (isTokenExpired(response.data)) {
						console.warn('Token已过期，请重新登录或尝试刷新。')
						setAccount({})
						return
					}
					const payload = decodeJwtPayload(response.data)
					console.log('payload', payload)
					if (payload) {
						setAccount({
							id: payload.id,
							displayName: payload.displayName,
							name: payload.name,
							email: payload.email,
							avatar: payload.avatar,
						})
					}

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
你需要根据@connectrpc/connect-web + @tanstack/react-query两者结合来编写API

在路由库的选择上是使用@tanstack/react-router,使用它的文件路由方式, 创建的路由文件都存储在routes目录里，每个目录名称都是一个路由

在用户管理,注册/登录功能使用casdoor-js-sdk和casdoor-react-sdk

在全局存储上,选择valtio作为store,对于需要存储的,例如购物车数据等必要的数据都使用valtio

对于环境变量, 使用.env.dev和.env.production文件来区分

对于枚举，常量创建constants目录存放和引用

对于配置， 创建一个conf目录存放， 例如casdoor的配置参数

对于类型，使用type而不使用interface关键字，统一存放在types目录

对于帮助函数，创建utils 目录存放

对于需要封装成hook的， 创建hooks目录存放

在可观测性方面， 你需要检查api/interceptors

在工程化方面：
在提交时需要根据.commitlintrc.cjs，cz-git，lint-staged的规则来编写本次的提交

在Lint方面，你需要遵循biome.json的规则来严格执行

在提交之前， 执行pnpm lint ,pnpm check来格式化和检查是否通过检查

你每次在编写前都需要提交上次的更改,需要使用conventional-changelog来生成描述,根据改动的幅度来改变版本号,从上次版本号开始,如果是第一次,从v0.0.1开始

编写必要的测试，使用vitest,vitest-browser-react

借助 web-vitals 库，在代码中衡量LCP，INP，CLS指标