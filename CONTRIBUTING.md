[English](./CONTRIBUTING_EN.md) | [中文](./CONTRIBUTING.md)

# 🛠️ NeriPlayer Desktop 贡献指南

NeriPlayer Desktop 当前是**预览版**。多源播放、本地音乐管理、下载、歌词、云同步和一起听已有实现，仍需要平台与场景验证。本文说明当前仓库的开发入口和工程边界；用户功能、安装与数据安全说明见 [README.md](./README.md)。

开发和测试请使用可恢复的数据副本。第三方平台接口可能变化，单元测试通过不代表在线服务、原生窗口或跨设备行为已验证。

## 📚 文档与事实来源

| 事项 | 来源 |
| --- | --- |
| 前端依赖、工具和测试命令 | [package.json](./package.json)、[pnpm-lock.yaml](./pnpm-lock.yaml) |
| Rust 版本与依赖 | [rust-toolchain.toml](./rust-toolchain.toml)、[Cargo.toml](./src-tauri/Cargo.toml)、[Cargo.lock](./src-tauri/Cargo.lock) |
| 窗口、安全、资源和打包配置 | [tauri.conf.json](./src-tauri/tauri.conf.json)、[capabilities](./src-tauri/capabilities/) |
| 开发启动、版本信息 | [run-tauri.mjs](./scripts/run-tauri.mjs)、[build.rs](./src-tauri/build.rs) |
| 检查、测试包与发布 | [.github/workflows](./.github/workflows/) |
| FFmpeg 构建、分发与解码验证 | [FFmpeg README](./src-tauri/native/ffmpeg/README.md) |
| 贡献与社区规范 | [PR 模板](./.github/PULL_REQUEST_TEMPLATE.md)、[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) |

行为变化同步维护中英文 README；开发、协议、测试或发布方式变化同步维护两份 CONTRIBUTING。不要将尚未实现的计划写成现有能力。

## 🔧 开发环境

- **Git**：克隆、初始化子模块，并为构建提供提交信息。
- **Node.js**：CI 当前使用 20；仓库未声明 `engines`。复现 CI 可使用相同主版本，使用其它版本时记录验证环境。
- **pnpm 9.15.9**：由 `packageManager` 固定，保留锁文件。已有 Corepack 的环境可运行 `corepack enable`；否则先按 pnpm 官方说明安装对应版本。
- **Rust 1.95.0**：通过 rustup 安装，`rust-toolchain.toml` 使用 `minimal` profile。Clippy、rustfmt 并非该 profile 默认组件，按需通过 `rustup component add clippy rustfmt` 安装。
- **Tauri 2 / Vue 3 / Vite 6 / TypeScript 5**：由项目依赖安装，无需全局安装 Tauri CLI。

平台依赖以 [Tauri 官方前置条件](https://v2.tauri.app/start/prerequisites/) 为准。Windows 需要带 C++ 桌面开发工作负载的 Microsoft C++ Build Tools、WebView2 与 MSVC Rust 工具链；macOS 桌面开发可使用 Xcode Command Line Tools。

Linux 需要 WebKitGTK 4.1、GTK、OpenSSL、托盘与 ALSA 开发依赖。以下以仓库 CI 的 Ubuntu 22.04 为基础，补齐本机编译工具；其它发行版按官方文档映射包名：

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config curl wget file libssl-dev \
  libxdo-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
  patchelf libasound2-dev
```

构建 Linux RPM 时另外安装 `rpm`。构建 FFmpeg 的额外工具见其独立说明。Windows MSI 打包可能需要启用 VBScript 可选功能，排查方法见 Tauri 官方前置条件。

## ▶️ 克隆与开发

从仓库根目录执行：

```bash
git clone --recursive https://github.com/cwuom/NeriPlayer-Desktop.git
cd NeriPlayer-Desktop
pnpm install --frozen-lockfile
pnpm tauri dev
```

已有克隆若未取子模块，先运行 `git submodule update --init --recursive`。`vendor/applemusic-like-lyrics` 的 core 源码由 Vite 直接引用，缺少它会使前端构建失败。

| 命令 | 用途与限制 |
| --- | --- |
| `pnpm tauri dev` | 启动 Vite 和 Rust 原生应用，适合验证完整桌面流程 |
| `pnpm dev` | 仅前端；浏览器没有原生 IPC，不能验证播放、登录、文件和系统集成 |
| `pnpm build` | `vue-tsc --build` 类型检查和 Vite 构建，输出 `dist/` |
| `pnpm preview` | 预览已构建的前端，仍没有原生后端 |
| `pnpm tauri build -- --locked` | 构建原生应用和安装包；FFmpeg 需要另行配置 |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | 检查 Rust 后端，仍需要平台依赖和 C++ 编译器 |

`pnpm tauri` 经 `scripts/run-tauri.mjs` 转发。开发端口默认 1420，冲突时在后续 49 个端口内寻找可用端口，并同步 Vite 与 Tauri 地址；`NERI_DEV_PORT` 可指定端口，指定端口必须可用。直接运行 `pnpm dev` 使用严格端口配置，不自动换端口。

设置页连续点击版本号 7 次可启用开发者模式，进入 Debug 页查看平台探针、日志、崩溃与构建信息。分享日志前仍需核查脱敏结果。

## 🧩 架构与模块边界

前端 WebView 负责 Vue 界面与状态编排，Rust 后端负责平台请求、音频输出、凭据、文件与同步；两侧通过 Tauri 命令和事件通信。

| 目录或入口 | 当前职责 |
| --- | --- |
| `src/main.ts`、`src/views/` | 应用启动、路由与页面 |
| `src/stores/` | 播放、设置、账号、曲库、下载、历史、统计、首页、歌词与同步状态 |
| `src/modules/` | 播放策略、歌词、下载调度、快捷键、曲库、YouTube、托盘与持久化逻辑 |
| `src/modules/persistence/userData.ts` | 启动快照、旧 localStorage 迁移、串行持久化写入 |
| `src/stores/listenTogether/` | 协议映射、队列、播放同步、重连与看门狗 |
| `src/components/`、`src/composables/` | 播放器、AMLL 歌词、桌面歌词、托盘弹窗、菜单与共用交互 |
| `src/i18n/`、`src/shaders/` | 简繁中文、英文、日文与背景着色器 |
| `src-tauri/src/main.rs`、`state.rs` | 原生应用、命令注册、事件、窗口与共享运行状态 |
| `src-tauri/src/commands/` | 业务 IPC，包括本地文件、桌面歌词、用户数据和托盘 |
| `src-tauri/src/audio/` | CPAL、Symphonia / FFmpeg、缓冲、Range / HLS、队列、效果、变速与媒体会话 |
| `src-tauri/src/api/`、`auth/` | 网易云、QQ、Bilibili、YouTube、LRCLIB 请求与授权 |
| `src-tauri/src/db/` | `neri_user_data.db`、schema、事务、旧数据迁移及缓存 |
| `src-tauri/src/library/`、`lyrics/`、`stats/` | 本地扫描与标签、歌单、歌词、播放统计 |
| `src-tauri/src/library/local_index.rs` | 多文件夹持久索引、notify 原生监听与增量更新，另存 `local-library.json` |
| `src-tauri/src/sync/` | Android 兼容模型、三路合并、V4 归档、GitHub / WebDAV、迁移与回收 |
| `src-tauri/src/listen_together/` | 实时会话、WebSocket 与协议模型 |
| `src-tauri/src/security.rs`、`logging/`、`fsutil.rs` | 凭据、日志与文件原子写入 |
| `src-tauri/native/ffmpeg/` | C++17 运行时加载垫片与固定公共头文件 |

用户数据已从分散的 JSON / localStorage 迁移到 SQLite，包括歌单、收藏、历史、队列、统计、下载目录与同步元数据。持久化变更复用既有数据库与领域事务，不另建独立 JSON 副本。设置、凭据、缓存、媒体和导出仍有各自存储路径；剩余文件写入复用 `fsutil.rs` 等既有原子写入流程。

本地音乐文件夹与曲目索引另存 `local-library.json`，不属于上述 SQLite 数据。`local_index.rs` 用文件大小和修改时间复用未变曲目，通过 notify 原生事件合并触发增量扫描，启动时也会更新索引；`LocalFilesView.vue` 可直接播放筛选或选中的曲目，再由用户选择导入歌单。

新增命令需要实现 `commands/` 入口、在 `main.rs` 的 `generate_handler!` 注册，并更新前端参数与返回类型。JavaScript 参数沿用 camelCase，Rust 参数及 serde 字段命名与之对齐。共享状态与持久化优先放在已有 store / module；后端状态变化复用事件，监听随组件或作用域卸载清理。

### 必须保护的链路

- **播放与取消**：需要锁定音频引擎的重操作通过既有阻塞线程派发。保持播放请求、seek、预取与音频信息的 generation 校验，旧结果不能覆盖新曲目；取流缓存键包含相关客户端和曲目身份。
- **下载与本地文件**：保留取消、重试、sidecar、最终文件大小及清单一致性。添加/移除文件夹、增量索引与直接播放不隐式改写歌单；移除文件夹不删除原文件。标签编辑复用副本写入、读回核验与替换，保留歌词、封面与 NP 元数据。入口见 `download_cmd.rs`、`download_metadata.rs`、`download_catalog.rs`、`local_files_cmd.rs`、`library/local_index.rs` 与 `library/local_file_tags.rs`。
- **平台 API**：修改 WEAPI / EAPI、WBI、SAPISIDHASH 或 YouTube 挑战时，依据已有请求和签名实现验证；UI mock 不能证明真实取流。
- **界面与系统集成**：复用菜单路由、键盘、动画、封面缓存与窗口状态逻辑；IME 快捷键、托盘、桌面歌词、媒体键和多窗口需在原生环境验证。
- **凭据与日志**：凭据走 `security.rs`。Release 使用应用侧加密文件，Debug 使用随机路径明文文件；不承诺抵御同机同用户恶意进程。日志不得输出 Cookie、Token、同步密码或签名 URL。

### 常见扩展入口

- **新增设置**：在 `stores/settings.ts` 的 `AppSettings` 与默认值登记，补齐 `SettingsView.vue`、翻译、搜索入口及迁移；后端行为复用现有命令与 `settings/` 持久化，保留 `formatVersion` 兼容。
- **扩展平台**：从 `api/`、`auth/`、`search_cmd.rs` 与 `settings_cmd.rs` 的取流命令入手，再对齐前端来源映射、路由、下载、歌词、封面和统计身份。
- **调整歌词**：检查 Rust `lyrics/manager.rs` 和前端 `modules/lyrics/`、`stores/currentLyrics.ts`，保留已匹配歌词、翻译/罗马字、偏移与 AMLL 逐字结构；不要假设所有来源使用同一格式。

## 🔄 Android 协议与同步

云同步与一起听是外部兼容边界。修改前读取对应 Android 模型、策略和 Worker 实现，并记录对照提交。桌面仓库不包含一起听服务端；它位于 Android 仓库的 `np-submodule/NeriPlayer-LTW`。

同步从 `sync/models.rs`、`proto_models.rs`、`archive/`、`merge.rs` 和 `manager.rs` 开始：

- 保持 ProtoBuf 字段号和 V4 记录类型兼容，新增字段有缺省读取行为，旧字段号不可重新分配。
- 保留三路合并、因果 token 与删除记录，不能改为简单的最后写入覆盖。历史续播、收藏歌手、歌词偏移与 B站分 P 规则需检查本地和远端语义。
- B站跳过区间按 `bvid + cid` 绑定，使用 `biliVideoSkipRules`、V4 类型 14；清空保留 tombstone，避免旧端恢复规则。
- V4 迁移授权绑定目标、后端、凭据指纹与当前远端内容。GitHub 使用 HEAD 条件更新；WebDAV 使用强 ETag 或经过验证的有限排他集合租约，旧单文件迁移需要有限集合租约。保留远端完整对象校验，不用无条件覆盖替代。
- 互通验收实际执行桌面写 → Android 读 → Android 写 → 桌面读，覆盖编辑、删除、恢复与冲突；本地编解码测试只能证明其覆盖的样例。

一起听同时检查 Rust `listen_together/` 和前端 `stores/listenTogether/`，保持字段、房间版本与兼容回退。增量队列使用 `baseRoomVersion`，重复曲目以 `stableKey + occurrence` 定位；分享链接遵守设置与平台过滤。自动测试外还需验证桌面与 Android 同房、加入退出、重连、切歌、seek 与队列冲突。

## 🧪 验证入口

按影响范围先针对性检查，再扩大范围；在 PR 中记录实际执行的命令与结果。常用入口：

```bash
pnpm test
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --locked
```

`pnpm test` 由 `scripts/test-frontend.mjs` 枚举全部 `test:*` 并串行运行。覆盖纯逻辑、store、组件模拟与源码约束，并非浏览器端到端测试。新增回归在 `package.json` 注册，沿用已有组件与 IPC mock。

| 变更领域 | 针对性入口示例 |
| --- | --- |
| 播放、续播、来源信息 | `test:playback-request`、`test:playback-queue`、`test:playback-audio-info`、`test:long-form-progress` |
| 首页、曲库、搜索 | `test:home-continue`、`test:home-feed`、`test:local-artists`、`test:search-store` |
| 下载、扫描、持久化 | `test:download-store`、`test:download-cancellation`、`test:local-scan-preview`、`test:local-scan-store`、`test:user-data-persistence` |
| 歌词、桌面歌词 | `test:lyrics-format`、`test:lyrics-request`、`test:lyric-offset-store`、`test:desktop-lyrics`、`test:desktop-lyrics-style` |
| 菜单、窗口、快捷键 | `test:collection-menus`、`test:context-menu-utils`、`test:tray-popup`、`test:title-bar-window-state`、`test:shortcut-settings` |
| 同步与 B站分 P | `test:sync-protocol-upgrade`、`test:history-sync`、`test:bili-video-skip`、`test:bili-video-skip-store`、`test:bili-video-skip-runtime`、`test:bili-video-skip-dialog` |
| 一起听 | `test:listen-together-protocol`、`test:listen-together-queue`、`test:listen-together-sync`、`test:listen-together-reconnect`、`test:listen-together-store` |
| FFmpeg 配置 | `test:ffmpeg-bundle` |

表中使用 `pnpm <入口>` 运行；完整清单以 `package.json` 为准。Rust 可使用过滤器：

```bash
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib sync
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib listen_together
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib library::local_file_tags::tests
```

FFmpeg 解码测试缺库时可能跳过；要证明实际解码，设置 `NERI_FFMPEG_DIR` 和 `NERI_REQUIRE_FFMPEG=1`，具体命令见 [FFmpeg README](./src-tauri/native/ffmpeg/README.md)。

Android JVM 反向解码辅助检查需要 PowerShell 7、Node、Python、Java、Android 源码及脚本指定版本的已有 Kotlin / kotlinx.serialization Gradle 缓存：

```powershell
./scripts/test-sync-android-interop.ps1 -AndroidRoot <Android仓库路径> -ExportFixtures
```

脚本只读 Android 源码与缓存，保留审计输出；不安装缺失依赖、不访问云端，不替代整仓 Gradle、provider 或设备互通测试。真实手机操作须预先获得授权，优先使用模拟器。

## 📦 打包、CI 与发布

普通 `pnpm tauri build` 可以构建，但不会自动下载或打包 FFmpeg。完整解码包先按 [FFmpeg README](./src-tauri/native/ffmpeg/README.md) 准备共享库，再生成并合并配置，例如 Windows x64：

```powershell
node scripts/ffmpeg/bundle-config.mjs windows-x86_64
pnpm tauri build --config .cache/ffmpeg-build/windows-x86_64/tauri.bundle.json -- --locked
```

不使用 `--target` 时产物默认在 `src-tauri/target/release/bundle/`；显式指定目标时在 `src-tauri/target/<Rust目标>/release/bundle/`，`CARGO_TARGET_DIR` 可改变根目录。

| 平台 | Rust 目标 | FFmpeg 目标 | 发布包 |
| --- | --- | --- | --- |
| Windows x64 | `x86_64-pc-windows-msvc` | `windows-x86_64` | NSIS `.exe`、`.msi` |
| macOS Apple Silicon | `aarch64-apple-darwin` | `macos-aarch64` | `.dmg`，发布最低系统配置 11.0 |
| macOS Intel | `x86_64-apple-darwin` | `macos-x86_64` | `.dmg`，发布最低系统配置 10.15 |
| Linux x64 | `x86_64-unknown-linux-gnu` | `linux-x86_64` | `.deb`、`.rpm`、`.AppImage.tar.gz` |

macOS 基础配置为 ad-hoc 签名，非 Apple 公证；Release 设置各架构系统下限，校验签名与库架构，并给 DMG 加 `-adhoc` 后缀。基础 `tauri.conf.json` 为 10.15，本地 arm64 发布构建应与工作流一致设置 `MACOSX_DEPLOYMENT_TARGET=11.0` 并覆盖 `bundle.macOS.minimumSystemVersion`，不能把基础值当作 arm64 支持承诺。Linux 本地生成 `.AppImage`，工作流上传前压为 `.tar.gz`。

- **`build.yml` / CI**：main、master 推送与 PR 或手动触发；运行 `pnpm test`、`pnpm build`，四个 Rust 目标执行 locked check；随包 FFmpeg 解码测试覆盖 Windows x64、macOS arm64、Linux x64。不运行完整 Rust 单元测试集或 Clippy。
- **`artifacts.yml` / Artifacts**：main、master 推送或手动触发；四目标测试包附共享构建信息，安装包保留 3 天，构建元数据保留 14 天，不发布 GitHub Release。
- **`ffmpeg.yml` / FFmpeg**：被调用或手动触发，四份共享库 artifact 名为 `ffmpeg-<FFmpeg目标>`。
- **`release.yml` / Release**：`v*` 标签或手动指定 `target_ref`；手动路径生成构建版本标签，标签含连字符的标签发布标为 prerelease。**项目预览版状态与 GitHub prerelease 标记是不同概念。**

CI 和 Artifacts 对纯文档、Markdown、许可证和模板变更设路径忽略；没有自动运行结果不等于通过。Release 独立构建并检查安装包，附 FFmpeg 源码、构建脚本、macOS 安装说明和 `SHA256SUMS.txt`；包内容检查不替代安装后的原生验收。

设置页构建版本为 `<7位Git哈希>.<MMddHHmm>`（UTC+8，CI 使用 Asia/Taipei），另有 UUID 和时间。`package.json` / Cargo 的 `1.0.0` 是打包元数据，不能据此称项目为稳定 1.0。`run-tauri.mjs` 注入 `NERI_BUILD_EPOCH`，CI 还统一 `NERI_BUILD_GIT_SHA` 和 `NERI_BUILD_UUID` 以关联多平台产物；固定元数据不代表二进制逐字节可复现。

## 🤝 提交与安全

先检查源码、文档和 `git status`，保留已有未提交修改。变更保持局部，回归测试复现问题；不要删除有效测试、忽略新警告或升级无关依赖。

PR 严格使用 [模板](./.github/PULL_REQUEST_TEMPLATE.md)，说明动机、范围、兼容性、实际命令与结果，未验证内容与原因；UI 变化附截图或录屏。Commit 与 PR 标题使用英文 Conventional Commits，如 `fix(player): preserve track identity during fallback`，文档同步双语。

不要提交或公开 Cookie、Token、密码、私有曲库、完整配置导出、数据库或敏感日志。完整配置可能包含平台授权与同步凭据，不适合公开附件。不要提交 `dist/`、`src-tauri/target/`、`.cache/`、`.report/`、`docs-private/` 和本地 IDE 配置。

## ⚖️ 许可与沟通

- 项目仅供学习与研究，遵守来源平台规则和适用法律；项目与维护者不接受赞助、捐赠或商业资助。
- 贡献使用 **GPL-3.0-or-later**；2026-10-07 前按 MIT 提交的代码保留 [原声明](./LICENSES/MIT.txt)。
- `vendor/applemusic-like-lyrics` 遵循自身 AGPL-3.0 许可；保留随包 FFmpeg 的 LGPL 声明、源码与构建脚本。
- 移植 Android 实现保留版权与许可，在提交正文注明来源和对照版本。

缺陷与建议使用 [Issues](https://github.com/cwuom/NeriPlayer-Desktop/issues)，遵守 [社区行为准则](./CODE_OF_CONDUCT.md)。涉及同步模型、一起听协议或大幅架构变化，建议先通过 Issue 对齐方向。


