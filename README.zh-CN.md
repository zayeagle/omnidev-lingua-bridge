# Lingua Bridge

[English](./README.md) | **中文**

**定位：仅中英互译（Chinese ↔ English）。** 不支持其他语种。

Chrome / Firefox 扩展：页面翻译与**视频同声传译**——划词气泡、双语字幕、可选语音传译。告别复制粘贴到外部翻译工具。

- **界面国际化**：弹窗 / 设置 / 划词气泡随浏览器/系统语言显示（`_locales`：en / zh_CN / zh_TW）。
- **API Key 可选**：不配置也能做基础页面传译；配置供应商 Key 后视频同传更稳。

## 一键打包（Windows / Linux / macOS）

产出 Chrome + Firefox 可安装 zip：

```bash
npm run pack:all          # 推荐
# Windows:
pack.cmd
# Linux / macOS:
chmod +x pack.sh && ./pack.sh
# 或:
make pack
```

跳过测试加快打包：`npm run pack:all -- --skip-test` 或 `./pack.sh --skip-test`

## 安装到浏览器

打包产物是**标准扩展包**，可在浏览器「扩展程序」页加载（开发者/临时模式）。  
这与应用商店里点「添加至 Chrome」的永久安装不是同一路径（见下方限制）。

```bash
npm install             # 首次
npm run pack:all
```

产物目录：`.output/`（含 `chrome-mv3/`、`firefox-mv2/` 与 `*-chrome.zip` / `*-firefox.zip`）。

### Chrome / Edge（推荐）

1. 完成打包（`npm run pack:all` 或 `pack.cmd`）
2. 打开 `chrome://extensions`（Edge：`edge://extensions`）
3. 打开右上角 **开发者模式**
4. 任选其一安装：
   - **推荐**：点 **加载已解压的扩展程序** → 选择目录 `.output/chrome-mv3`
   - 或将 `.output/omnidev-lingua-bridge-*-chrome.zip` 拖到扩展页（视环境而定）

装好后会像普通扩展一样出现在工具栏（图标、弹窗、选项页）。

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点 **临时载入附加组件**
3. 选择 `.output/firefox-mv2` 下的 `manifest.json`，或对应的 `*-firefox.zip`

说明：临时载入在浏览器重启后可能失效；长期安装一般需经 [Firefox AMO](https://addons.mozilla.org/) 签名上架。

### 限制（不能直接做到的）

| 期望 | 实际情况 |
|------|----------|
| 像商店一样一键「添加至 Chrome」且永久安装 | 未上架时**做不到**；需开启开发者模式后本地加载 |
| 完全不开发者模式也能安装未签名包 | Chrome 对未签名扩展有限制；日常本地请用「开发者模式 + 加载已解压」 |
| Firefox 一次加载永久生效 | 临时载入会随重启失效；永久需 AMO 签名 |

## 使用

1. 弹窗打开主开关（**默认划词气泡**，不会整页自动刷译）
2. 在页面上**选中文字** → 旁侧气泡：**翻译**（完成后附带关键词讲解）/ **整页**
3. 视频同传：选 **静默字幕** 或 **语音传译**，再开启本页同传
4. （可选）配置 API Key，讲解与视频音轨更稳

### 功能对照

| 能力 | 无 API Key | 有 API Key |
|------|------------|------------|
| 划词翻译 / 讲解 | 免费引擎 + 简要词提示 | AI 译文 + 关键词讲解 |
| 整页自动译 | 可选模式 | 可选模式 |
| 视频同传 | 麦克风 Web Speech（降级） | 视频音轨 STT + TTS |
| 安全加固加密存储 | — | 可选 |

页面提示约 4 秒自动消失，也可点 × 关闭。  
免费路径可能把文本发往公共翻译实例；敏感页面建议配置自有 Key。

## API Key 安全

本扩展**无自建后端**：Key 只存在你本机浏览器的扩展存储（`storage.local`），不会上传到本项目的任何服务器。

| 措施 | 说明 |
|------|------|
| 隔离调用 | 仅 **background** 读取 Key 并带 `Authorization` 请求；网页 content **不加载** Key |
| 公开偏好 | `local:publicPrefs`：`enabled` / `speechMode` / `hasApiKey`（无 Key 原文） |
| 可选加密 | 设置页「安全加固」：PBKDF2 + AES-GCM；口令**会话解锁**（不落盘自动解锁） |
| Base URL | **仅允许 https**；非 `api.openai.com` 须勾选「确认端点可信」 |
| 选项页 | 不回填完整密钥；不支持的 STT/TTS 不展示填写 |
| 弹窗 | 只读公开偏好，不加载原始 Key |
| 滥用抑制 | background 对 `ai.*` 按标签页限流 |
| 错误消毒 | 返回文案去掉密钥原文 |
| 构建断言 | `npm run assert:content` 确保 content 包不含 `apiKey` / `local:settings` |

**仍须注意（扩展无法绝对消除）：**

- Key 会发送到你确认过的 **Base URL**（钓鱼端点仍会骗走 Key——请只填可信服务）
- 本机恶意软件 / 能读浏览器配置目录的程序仍可能读到 `storage.local`
- 请勿把含 Key 的截图、导出包或调试日志发给他人

## 开发

```bash
npm run dev           # Chrome
npm run dev:firefox
npm test
make deploy           # 测试 + 双浏览器构建
```

## 版本

**v0.4.29** — 中英同传、静默/语音样式同步、关闭字幕浮窗时同步按钮与实时状态、界面 i18n。
