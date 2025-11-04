/// <reference types="vitest/config" />
// 1. 确保从 'vitest/config' 导入 defineConfig，以包含 'test' 类型
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { resolve } from 'node:path'

// 导出函数，以便根据环境区分配置
// 如果你的 package.json 中 'build' 脚本没有设置 NODE_ENV，
// Vite 在 'build' 命令下 mode 默认为 'production'
export default defineConfig(({ mode }) => {
    // 检查是否处于构建/生产模式
    const isBuild = mode === 'production' || process.env.NODE_ENV === 'production';

    // 如果是构建模式（生产环境），则 browser 配置应该被禁用或移除
    const testConfig = isBuild ? {
        // 生产模式下只保留必要的测试配置
        environment: 'jsdom',
        // 确保没有 'browser' 属性或 browser.enabled 为 false
    } : {
        // 开发或测试模式下启用浏览器测试
        browser: {
            enabled: true,
            provider: playwright(),
            instances: [
                { browser: 'chromium' },
            ],
            // 注意: 在 Docker 或 CI 环境中，通常需要将 headless 设为 true
            headless: true, // 建议在 Docker/CI 中始终设置为 true
            ui: false,      // 在 Docker/CI 中通常也应禁用 UI
        },
        environment: 'jsdom',
    };

    return {
        plugins: [
            tanstackRouter({
                target: 'react',
                autoCodeSplitting: true
            }),
            viteReact(),
        ],
        // 2. test 配置现在可以动态地根据模式设置
        test: testConfig,
        resolve: {
            alias: {
                '@': resolve(__dirname, './src'),
            },
        },
    }
})
