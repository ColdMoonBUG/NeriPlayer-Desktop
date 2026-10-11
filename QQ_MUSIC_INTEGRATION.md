# QQ 音乐接入与验证

设置 → 账号中可使用 QQ 或微信登录，登录后显示头像与昵称。探索页的 QQ 音乐标签支持歌曲搜索、分页、加入播放队列及现有曲目菜单；音乐库的 QQ 标签同步账号自建与收藏歌单，支持刷新、打开详情和整单播放；音质与下载设置支持标准、高品质和无损。登录凭据通过现有 AuthState 和凭据存储保存，重启后恢复，退出登录后清除。旧版本没有 QQ 字段的登录数据仍可读取。

接入复用了 YAQMC 的 QQ／微信 OAuth 流程与协议边界，并使用其固定版本的 [qm-api-rs](https://github.com/YAQMC/qm-api-rs/tree/75f6e4d392f6d3e64608fb48e2480fb0087009e3)（GPL-3.0-or-later）。YAQMC 自身的前端、Core、存储和音频引擎不作为依赖。QQ 回调验证参考 `YAQMC/crates/yaqmc-provider-qqmusic/src/qqmusic/oauth.rs`；歌曲授权参考 `src/qmapi/vkey.rs`。

QQ 授权窗口使用独立无痕会话，只允许对应腾讯授权域名，拒绝新窗口；回调必须匹配 HTTPS 主机、路径、登录类型、返回地址和唯一 state，授权 code 只在原生端交换。窗口不读取密码或浏览器 Cookie。歌曲授权使用账号凭据、歌曲类型及 media MID；上游拒绝的音质依次回退，不提供或生成会员权限。播放支持现有解码器可直接读取的 MP3、AAC、FLAC；YAQMC 的加密 mflac 管线未迁移。账号歌单使用 YAQMC 的分页读取协议，不修改或删除远端歌单。

协议请求复用 NeriPlayer 的代理切换和网络兜底；请求客户端不使用共享 Cookie，不跟随重定向；错误消息不包含授权 code、密钥或媒体 URL。

## 验证

```powershell
pnpm install --frozen-lockfile
git submodule update --init vendor/applemusic-like-lyrics
pnpm build
pnpm test
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib qq
cargo test --manifest-path src-tauri/Cargo.toml --lib qq_live_search_lyrics_and_playback -- --ignored --nocapture
```

真实账号验收需要在桌面窗口完成授权：分别用 QQ／微信登录，确认账号显示，搜索并播放账号可访问的歌曲，切换音质，重启检查登录恢复，退出后确认凭据清除；关闭授权窗口应结束等待。没有相应权益的歌曲应显示播放不可用，不应被宣称已获得授权。

`qm-api-rs` 包含 QMCDecode 的 MIT 许可衍生实现；依赖的来源、提交和完整许可信息见其 [THIRD_PARTY_NOTICES.md](https://github.com/YAQMC/qm-api-rs/blob/75f6e4d392f6d3e64608fb48e2480fb0087009e3/THIRD_PARTY_NOTICES.md)。
