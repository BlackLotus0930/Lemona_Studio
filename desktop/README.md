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

## 打包发布

### Windows 打包（NSIS 安装包）

```bash
npm run dist:win
```

打包完成后，安装包会在 `release` 目录下：
- `Lemona-0.1.0-x64.exe` - Windows 安装程序

### macOS 打包（DMG）

```bash
npm run dist:mac
```

打包完成后，DMG 文件会在 `release` 目录下。

### Linux 打包（AppImage）

```bash
npm run dist:linux
```

打包完成后，AppImage 文件会在 `release` 目录下。

### 通用打包（当前平台）

```bash
npm run dist
```

### 图标文件说明

当前使用 PNG 图标（`../frontend/public/lemonalogo.png`），electron-builder 会自动转换。

**推荐**：为了最佳效果，可以准备平台特定的图标：
- **Windows**: `build/icon.ico` (256x256 或更大，多尺寸)
- **macOS**: `build/icon.icns` (512x512 或更大)
- **Linux**: `build/icon.png` (512x512)

如果提供了这些文件，electron-builder 会自动使用它们。

## 当前状态

✅ 基础架构完成：
- Electron 主进程配置
- 预加载脚本（Context Bridge）
- TypeScript 配置
- 开发环境设置
- **打包配置完成（Windows NSIS / Mac DMG / Linux AppImage）**

下一步：实现 IPC 通信层，替代 HTTP API。

