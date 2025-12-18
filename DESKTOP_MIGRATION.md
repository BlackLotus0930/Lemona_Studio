# Desktop Migration Guide

## 当前状态：专注于 Desktop 开发

我们已经将项目切换到 **Desktop 模式**，Web 相关配置已注释或禁用。

## Web 版本保存

如果你想保留 Web 版本的代码，建议创建一个分支：

```bash
# 创建并切换到 Web 版本分支
git checkout -b web-version

# 恢复 Web 配置（如果需要）
# 然后提交
git add .
git commit -m "Save Web version snapshot"
```

## 已禁用的 Web 功能

1. **前端 API 代理** (`frontend/vite.config.ts`)
   - `/api` proxy 已注释
   - Desktop 使用 IPC 通信

2. **HTTP API** (`frontend/src/services/api.ts`)
   - 已重定向到 `desktop-api.ts`
   - Web 模式代码已注释保存

3. **后端 Express 服务器** (`backend/src/server.ts`)
   - 保留代码但不再启动
   - Desktop 直接使用服务层

## Desktop 架构

```
Desktop App (Electron)
  ├── Main Process (desktop/main/)
  │   ├── index.ts - 窗口管理
  │   └── ipc.ts - IPC 处理
  ├── Preload (desktop/preload/)
  │   └── index.ts - Context Bridge
  └── Frontend (frontend/)
      └── services/desktop-api.ts - IPC 调用
```

## 开发流程

1. **启动前端开发服务器**:
   ```bash
   cd frontend
   npm run dev
   ```

2. **启动 Electron**:
   ```bash
   cd desktop
   npm run dev
   ```

## 下一步

- [ ] 实现 IPC 通信层
- [ ] 迁移后端服务到 Desktop
- [ ] 实现本地文件存储
- [ ] 集成 Ollama (Local Model)

