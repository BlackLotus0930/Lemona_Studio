# 自动更新设置指南

## 已完成的工作

✅ 已安装 `electron-updater` 和 `electron-log` 依赖  
✅ 已配置 `package.json` 中的 GitHub 发布设置  
✅ 已在主进程中添加自动更新代码  
✅ 已更新版本号到 1.0.0  

## 第四步：设置 GitHub Token

为了使用自动更新功能，你需要设置 GitHub Personal Access Token。

### 🚀 快速开始（推荐）

**最简单的方法**：
1. 创建 GitHub Token（见下方步骤）
2. 按 `Win + R` → 输入 `sysdm.cpl` → 回车
3. 点击 "高级" → "环境变量"
4. 在 "用户变量" 点击 "新建"
5. 变量名：`GH_TOKEN`，变量值：你的 token
6. 点击 "确定"，**关闭所有终端窗口，重新打开**
7. 完成！

现在可以运行 `npm run dist:win` 了。

### 1. 创建 GitHub Token

1. 访问 GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - 链接：https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 设置 Token 名称（例如：`Lemona Auto Updater`）
4. 选择过期时间（建议选择较长时间，如 90 天或 1 年）
5. 勾选以下权限：
   - `repo` (完整仓库访问权限)
6. 点击 "Generate token"
7. **重要**：复制生成的 token（只显示一次）

### 2. 设置环境变量

环境变量有三种设置方式，根据你的需求选择：

#### 方式一：临时设置（仅当前 PowerShell 窗口有效）

在 PowerShell 中运行：
```powershell
$env:GH_TOKEN="your_token_here"
```

**特点**：
- ✅ 立即生效
- ❌ 关闭 PowerShell 窗口后失效
- ✅ 适合临时测试

**验证是否设置成功**：
```powershell
echo $env:GH_TOKEN
```

#### 方式二：永久设置（推荐，系统环境变量）

**方法 A：通过图形界面设置（最简单）**

1. 按 `Win + R`，输入 `sysdm.cpl`，回车
2. 点击 "高级" 标签页
3. 点击 "环境变量" 按钮
4. 在 "用户变量" 区域点击 "新建"
5. 输入：
   - 变量名：`GH_TOKEN`
   - 变量值：你的 GitHub token（例如：`ghp_xxxxxxxxxxxxx`）
6. 点击 "确定" 保存
7. **重要**：关闭所有 PowerShell/CMD 窗口，重新打开才能生效

**方法 B：通过 PowerShell 设置（管理员权限）**

```powershell
# 以管理员身份运行 PowerShell，然后执行：
[System.Environment]::SetEnvironmentVariable('GH_TOKEN', 'your_token_here', 'User')
```

**验证是否设置成功**：
```powershell
# 重新打开 PowerShell，然后运行：
echo $env:GH_TOKEN
```

#### 方式三：在 package.json 脚本中设置（每次构建时设置）

修改 `desktop/package.json` 中的构建脚本：

```json
{
  "scripts": {
    "dist:win": "set GH_TOKEN=your_token_here && npm run build:all && electron-builder --win",
    "dist:mac": "export GH_TOKEN=your_token_here && npm run build:all && electron-builder --mac"
  }
}
```

**注意**：这种方式会将 token 暴露在代码中，**不推荐用于生产环境**。

#### macOS/Linux
```bash
export GH_TOKEN="your_token_here"
```

永久设置：将以下内容添加到 `~/.bashrc` 或 `~/.zshrc`：
```bash
export GH_TOKEN="your_token_here"
```

#### macOS/Linux
将以下内容添加到 `~/.bashrc` 或 `~/.zshrc`：
```bash
export GH_TOKEN="your_token_here"
```

然后运行：
```bash
source ~/.bashrc  # 或 source ~/.zshrc
```

## 构建和发布

### 构建应用

```bash
cd desktop

# Windows
npm run dist:win

# macOS
npm run dist:mac

# Linux
npm run dist:linux
```

### 发布到 GitHub Releases

构建完成后，electron-builder 会自动：
1. 创建 GitHub Release
2. 上传构建文件
3. 生成 `latest.yml`、`latest-mac.yml` 等更新清单文件

**注意**：确保设置了 `GH_TOKEN` 环境变量，否则发布会失败。

## 自动更新流程

1. **应用启动时**：延迟 5 秒后检查更新（不阻塞启动）
2. **定期检查**：每 4 小时自动检查一次更新
3. **更新可用时**：
   - 自动下载更新
   - 显示下载进度
   - 下载完成后自动安装（5秒后）

## 更新事件

主进程会向渲染进程发送以下事件：

- `update-checking` - 正在检查更新
- `update-available` - 有可用更新
- `update-not-available` - 已是最新版本
- `update-error` - 更新检查出错
- `update-download-progress` - 下载进度
- `update-downloaded` - 更新已下载

你可以在渲染进程中监听这些事件来显示更新状态给用户。

## 测试自动更新

### 开发环境测试

自动更新在开发环境中被禁用。要测试更新功能：

1. 构建当前版本（例如 1.0.0）
2. 安装并运行
3. 修改版本号为 1.0.1
4. 重新构建并发布到 GitHub
5. 运行 1.0.0 版本，应该会自动检测到更新

### 注意事项

- 确保 GitHub 仓库设置正确（`package.json` 中的 `owner` 和 `repo`）
- 确保有 GitHub Releases 的写入权限
- 首次发布需要手动创建 Release，后续版本会自动创建

## 故障排除

### 更新检查失败

1. 检查 `GH_TOKEN` 环境变量是否设置
2. 检查网络连接
3. 检查 GitHub 仓库权限
4. 查看主进程日志（控制台输出）

### 更新下载失败

1. 检查 GitHub Releases 中是否有对应的文件
2. 检查 `latest.yml` 文件是否存在
3. 检查网络连接

### 自动安装失败

- Windows：可能需要管理员权限
- macOS：可能需要用户确认
- Linux：AppImage 需要手动替换文件

## 配置说明

### package.json 配置

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "BlackLotus0930",  // 修改为你的 GitHub 用户名
      "repo": "Lemona-Studio"    // 修改为你的仓库名
    }
  }
}
```

### 自定义更新检查间隔

在 `desktop/main/index.ts` 中修改：

```typescript
// 修改检查间隔（毫秒）
setInterval(() => {
  autoUpdater.checkForUpdatesAndNotify();
}, 2 * 60 * 60 * 1000); // 2 小时
```

## 下一步

1. ✅ 设置 `GH_TOKEN` 环境变量
2. ✅ 构建应用：`npm run dist:win`（或对应平台）
3. ✅ 发布到 GitHub Releases（electron-builder 会自动处理）
4. ✅ 测试自动更新功能

祝你发布顺利！🎉
