# Lemona Desktop

Electron 桌面应用。

## 开发

### 第一步：启动前端开发服务器

在 `frontend` 目录运行：
```bash
cd ../frontend
npm run dev
```

前端会在 `http://localhost:5173` 运行。

### 第二步：启动 Electron

在 `desktop` 目录运行：
```bash
npm run dev
```

这会启动 Electron 窗口，加载前端应用。

## 当前状态

✅ 基础架构完成：
- Electron 主进程配置
- 预加载脚本（Context Bridge）
- TypeScript 配置
- 开发环境设置

下一步：实现 IPC 通信层，替代 HTTP API。

