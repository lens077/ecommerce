import React, {useState, useEffect} from 'react';
import logo from './assets/images/logo-universal.png';
import './App.css';
import { Greet, OpenLoginPage, GetAuthData } from "../wailsjs/go/main/App";
import { EventsOn } from '../wailsjs/runtime';

// 定义认证数据类型
interface AuthData {
    token: string;
    username: string;
    expires_at: string;
}

function App() {
    const [resultText, setResultText] = useState("Please enter your name below 👇");
    const [name, setName] = useState('');
    const [authInfo, setAuthInfo] = useState<AuthData | null>(null);
    const [showAuthPanel, setShowAuthPanel] = useState(false);

    const updateName = (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value);
    const updateResultText = (result: string) => setResultText(result);

    // 获取认证信息
    const fetchAuthData = async () => {
        try {
            const data = await GetAuthData();
            console.log("data", data)
            if (data && data.token) {
                setAuthInfo(data as AuthData);
                setShowAuthPanel(true);

                // 自动隐藏面板 after 10 seconds
                setTimeout(() => {
                    setShowAuthPanel(false);
                }, 10000);
            }
        } catch (error) {
            console.error("获取认证信息失败:", error);
        }
    };

    // 监听认证成功事件
    useEffect(() => {
        // 初始获取认证信息
        fetchAuthData();

        // 监听来自Go后端的认证成功事件
        const unsubscribe = EventsOn("auth-success", () => {
            console.log("收到认证成功事件");
            fetchAuthData();
        });

        // 清理函数
        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, []);

    function greet() {
        Greet(name).then(updateResultText);
    }

    return (
        <div id="App">
            {/*<img src={logo} id="logo" alt="logo"/>*/}
            <div id="result" className="result">{resultText}</div>
            <div id="input" className="input-box">
                <input id="name" className="input" onChange={updateName} autoComplete="off" name="input" type="text"/>
                <button className="btn" onClick={greet}>Greet</button>
            </div>
            <LoginButton/>

            {/* 认证信息面板 */}
            {showAuthPanel && authInfo && (
                <div className="auth-panel">
                    <h3>认证成功 🎉</h3>
                    <p>浏览器成功调用了桌面应用并传递了以下信息：</p>
                    <div className="auth-details">
                        <p><strong>用户名:</strong> {authInfo.username}</p>
                        <p><strong>Token:</strong> {authInfo.token.substring(0, 20)}...</p>
                        <p><strong>过期时间:</strong> {new Date(authInfo.expires_at).toLocaleString()}</p>
                        <p><strong>来源:</strong> 浏览器自定义协议调用</p>
                    </div>
                    <button
                        className="close-btn"
                        onClick={() => setShowAuthPanel(false)}
                    >
                        关闭
                    </button>
                </div>
            )}
        </div>
    )
}

const LoginButton = () => {
    const handleLoginClick = async () => {
        try {
            await OpenLoginPage();
            console.log('Login URL opened in system browser successfully.');
        } catch (error) {
            console.error('Failed to open login URL in browser:', error);
        }
    };

    return (
        <button onClick={handleLoginClick} className="login-button">
            使用系统浏览器登录
        </button>
    );
};

export default App
