[English](./CONTRIBUTING_EN.md) | [中文](./CONTRIBUTING.md)

# 🛠️ Contributing to NeriPlayer Desktop

NeriPlayer Desktop is currently a **preview release**. Multi-source playback, local music management, downloads, lyrics, cloud sync, and Listen Together are implemented, with platform and scenario validation still needed. This guide describes current development entry points and engineering boundaries. See [README_EN.md](./README_EN.md) for features, installation, and data safety.

Use recoverable copies of your data during development. Third-party APIs can change; passing unit tests does not establish online service, native window, or cross-device correctness.

## 📚 Documentation and sources of truth

| Topic | Source |
| --- | --- |
| Frontend dependencies, tools, and test commands | [package.json](./package.json), [pnpm-lock.yaml](./pnpm-lock.yaml) |
| Rust toolchain and dependencies | [rust-toolchain.toml](./rust-toolchain.toml), [Cargo.toml](./src-tauri/Cargo.toml), [Cargo.lock](./src-tauri/Cargo.lock) |
| Window, security, resource, and packaging configuration | [tauri.conf.json](./src-tauri/tauri.conf.json), [capabilities](./src-tauri/capabilities/) |
| Development startup and build metadata | [run-tauri.mjs](./scripts/run-tauri.mjs), [build.rs](./src-tauri/build.rs) |
| Checks, test packages, and releases | [.github/workflows](./.github/workflows/) |
| FFmpeg builds, distribution, and decoder validation | [FFmpeg README](./src-tauri/native/ffmpeg/README.md) |
| Contribution and community standards | [PR template](./.github/PULL_REQUEST_TEMPLATE.md), [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) |

Update both READMEs for user-facing changes and both CONTRIBUTING files for development, protocol, test, or release changes. Do not describe unimplemented plans as available functionality.

## 🔧 Development environment

- **Git**: clone, initialize the submodule, and supply revision metadata.
- **Node.js**: CI currently uses 20; the repository declares no `engines`. Use the same major version to reproduce CI, and record your environment when validating another version.
- **pnpm 9.15.9**: pinned by `packageManager`; preserve the lockfile. Run `corepack enable` if Corepack is available, otherwise install that pnpm version following its official instructions.
- **Rust 1.95.0**: install through rustup. `rust-toolchain.toml` selects the `minimal` profile; install optional components with `rustup component add clippy rustfmt` when needed.
- **Tauri 2 / Vue 3 / Vite 6 / TypeScript 5**: installed as project dependencies; no global Tauri CLI is needed.

Follow the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Windows needs Microsoft C++ Build Tools with desktop C++ development, WebView2, and an MSVC Rust toolchain; macOS desktop development can use Xcode Command Line Tools.

Linux needs WebKitGTK 4.1, GTK, OpenSSL, tray, and ALSA development libraries. This example follows the repository's Ubuntu 22.04 CI environment and adds local compiler tools; map package names using the official guide for other distributions:

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config curl wget file libssl-dev \
  libxdo-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
  patchelf libasound2-dev
```

Install `rpm` additionally for Linux RPM packages. FFmpeg's extra tools are described separately. Windows MSI packaging may need the VBScript optional feature; see Tauri's prerequisites for troubleshooting.

## ▶️ Clone and develop

Run from the repository root:

```bash
git clone --recursive https://github.com/cwuom/NeriPlayer-Desktop.git
cd NeriPlayer-Desktop
pnpm install --frozen-lockfile
pnpm tauri dev
```

For an existing clone without its submodule, run `git submodule update --init --recursive` first. Vite references the core sources of `vendor/applemusic-like-lyrics` directly, so missing files break frontend builds.

| Command | Purpose and limits |
| --- | --- |
| `pnpm tauri dev` | Start Vite and the native Rust app for desktop flow validation |
| `pnpm dev` | Frontend only; browser sessions have no native IPC for playback, login, files, or system integration |
| `pnpm build` | Run `vue-tsc --build` and Vite, producing `dist/` |
| `pnpm preview` | Preview the built frontend without a native backend |
| `pnpm tauri build -- --locked` | Build the native app and installers; configure FFmpeg separately |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | Check Rust; platform libraries and a C++ compiler are still required |

`pnpm tauri` forwards through `scripts/run-tauri.mjs`. Development starts at port 1420, searches the next 49 ports if needed, and sets matching Vite and Tauri addresses. `NERI_DEV_PORT` selects an explicit port, which must be available. Direct `pnpm dev` uses strict port configuration without automatic fallback.

Tap the Settings version label seven times to enable developer mode and access Debug for platform probes, logs, crash reports, and build metadata. Review redaction before sharing logs.

## 🧩 Architecture and module boundaries

The frontend WebView handles Vue rendering and state orchestration. Rust handles platform requests, audio output, credentials, files, and sync. Tauri commands and events connect them.

| Path or entry point | Current responsibility |
| --- | --- |
| `src/main.ts`, `src/views/` | Startup, routing, and pages |
| `src/stores/` | Player, settings, accounts, library, downloads, history, stats, home, lyrics, and sync state |
| `src/modules/` | Playback policies, lyrics, downloads, shortcuts, library, YouTube, tray, and persistence |
| `src/modules/persistence/userData.ts` | Startup snapshots, legacy localStorage migration, and serialized persistence writes |
| `src/stores/listenTogether/` | Protocol mapping, queue, playback sync, reconnection, and watchdog |
| `src/components/`, `src/composables/` | Player, AMLL/desktop lyrics, tray popup, menus, and shared interactions |
| `src/i18n/`, `src/shaders/` | Simplified/traditional Chinese, English, Japanese, and background shaders |
| `src-tauri/src/main.rs`, `state.rs` | Native app, command registration, events, windows, and shared runtime state |
| `src-tauri/src/commands/` | Domain IPC, including local files, desktop lyrics, user data, and tray |
| `src-tauri/src/audio/` | CPAL, Symphonia / FFmpeg, buffering, Range / HLS, queues, effects, speed, and media sessions |
| `src-tauri/src/api/`, `auth/` | NetEase, QQ, Bilibili, YouTube, LRCLIB requests and authorization |
| `src-tauri/src/db/` | `neri_user_data.db`, schema, transactions, legacy migration, and cache |
| `src-tauri/src/library/`, `lyrics/`, `stats/` | Local scanning/tags, playlists, lyrics, and playback stats |
| `src-tauri/src/library/local_index.rs` | Persistent multi-folder index, native notify events, and incremental updates in `local-library.json` |
| `src-tauri/src/sync/` | Android-compatible models, three-way merge, V4 archives, GitHub / WebDAV, migration, and GC |
| `src-tauri/src/listen_together/` | Realtime sessions, WebSocket, and protocol models |
| `src-tauri/src/security.rs`, `logging/`, `fsutil.rs` | Credentials, logging, and atomic file writes |
| `src-tauri/native/ffmpeg/` | C++17 runtime-loading shim and pinned public headers |

User data moved from scattered JSON / localStorage into SQLite, including playlists, favorites, history, queue, stats, download catalog, and sync metadata. Reuse existing database and domain transactions instead of creating independent JSON copies. Settings, credentials, caches, media, and exports retain their own storage paths; use `fsutil.rs` and existing atomic procedures for remaining file writes.

Local music folders and track indexes live separately in `local-library.json`, outside SQLite. `local_index.rs` reuses unchanged tracks by file size/modification time, coalesces native notify events into incremental scans, and updates indexes at startup. `LocalFilesView.vue` plays filtered or selected tracks directly and lets users choose to import them into playlists.

Adding a command requires an implementation in `commands/`, registration through `generate_handler!` in `main.rs`, and aligned frontend arguments/return types. Follow camelCase JavaScript conventions and matching Rust/serde field naming. Keep shared state and persistence in existing stores/modules; reuse backend events and dispose listeners with their component or scope.

### Flows to protect

- **Playback and cancellation**: dispatch expensive engine-locking operations through existing blocking workers. Preserve generation checks for requests, seek, prefetch, and audio metadata. Stream cache keys include relevant client choice and track identity.
- **Downloads and local files**: preserve cancellation, retry, sidecars, final file size, and catalog consistency. Adding/removing folders, incremental indexing, and direct playback must not implicitly change playlists; removing a folder does not delete source files. Reuse copy/write/read-back/replace procedures for tags, retaining lyrics, artwork, and NP metadata. See `download_cmd.rs`, `download_metadata.rs`, `download_catalog.rs`, `local_files_cmd.rs`, `library/local_index.rs`, and `library/local_file_tags.rs`.
- **Platform APIs**: verify WEAPI / EAPI, WBI, SAPISIDHASH, and YouTube challenge changes against existing request/signature implementations. UI mocks cannot establish actual stream resolution.
- **UI and system integration**: reuse menu routing, keyboard, animations, cover caching, and window state. IME shortcuts, tray, desktop lyrics, media keys, and multiple windows need native validation.
- **Credentials and logs**: use `security.rs`. Release uses application-encrypted files; Debug uses plaintext files at randomized paths. This does not promise protection from malicious processes running as the same user. Never log cookies, tokens, sync passwords, or signed URLs.

### Common extension entry points

- **Settings**: register `AppSettings` fields/defaults in `stores/settings.ts`; update `SettingsView.vue`, translations, search, and migration. Reuse commands and `settings/` persistence for backend behavior and preserve `formatVersion` compatibility.
- **Platforms**: start with `api/`, `auth/`, `search_cmd.rs`, and stream commands in `settings_cmd.rs`, then align frontend source mapping, routes, downloads, lyrics, covers, and statistics identity.
- **Lyrics**: inspect Rust `lyrics/manager.rs`, frontend `modules/lyrics/`, and `stores/currentLyrics.ts`. Preserve matched lyrics, translation/romanization, offsets, and AMLL word timing; sources do not all share one format.

## 🔄 Android protocols and sync

Cloud sync and Listen Together are external compatibility boundaries. Read corresponding Android models/policies and Worker implementation before changes, and record reference commits. The desktop repository contains no Listen Together server; it lives in `np-submodule/NeriPlayer-LTW` in the Android repository.

Start sync changes with `sync/models.rs`, `proto_models.rs`, `archive/`, `merge.rs`, and `manager.rs`:

- Preserve ProtoBuf field numbers and V4 record kinds. New fields need defaults; never reassign old numbers.
- Preserve three-way merge, causal tokens, and deletion records instead of simple last-write-wins. Resume positions, favorite artists, lyric offsets, and Bilibili per-part rules require local and remote semantics checks.
- Bilibili intervals bind to `bvid + cid`, using `biliVideoSkipRules` and V4 kind 14. Clearing retains a tombstone so old clients cannot restore the rule.
- Bind V4 migration approval to destination, backend, credential fingerprint, and remote contents. GitHub uses conditional HEAD updates; WebDAV uses strong ETags or verified finite exclusive collection leases. Legacy single-file migration requires a finite collection lease. Preserve remote object closure validation instead of unconditional overwrites.
- Interoperability acceptance requires Desktop write → Android read → Android write → Desktop read, including edits, deletion, restoration, and conflicts. Local codec tests prove only their covered fixtures.

Check Rust `listen_together/` and frontend `stores/listenTogether/` together, preserving fields, room versions, and compatibility fallback. Incremental queues use `baseRoomVersion`; repeated tracks use `stableKey + occurrence`. Link sharing respects settings and platform filtering. Beyond automated tests, verify Desktop/Android rooms, join/leave, reconnect, track changes, seek, and queue conflicts.

## 🧪 Verification entry points

Run targeted checks first, expanding according to impact, and record commands actually run and their results in the PR. Common entry points:

```bash
pnpm test
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --locked
```

`pnpm test` uses `scripts/test-frontend.mjs` to enumerate all `test:*` commands and run them sequentially. Coverage includes pure logic, stores, component mocks, and source constraints, rather than browser end-to-end testing. Register new regressions in `package.json` and maintain component/IPC mocks using existing patterns.

| Area | Example targeted entry points |
| --- | --- |
| Playback, resume, metadata | `test:playback-request`, `test:playback-queue`, `test:playback-audio-info`, `test:long-form-progress` |
| Home, library, search | `test:home-continue`, `test:home-feed`, `test:local-artists`, `test:search-store` |
| Downloads, scanning, persistence | `test:download-store`, `test:download-cancellation`, `test:local-scan-preview`, `test:local-scan-store`, `test:user-data-persistence` |
| Lyrics and desktop lyrics | `test:lyrics-format`, `test:lyrics-request`, `test:lyric-offset-store`, `test:desktop-lyrics`, `test:desktop-lyrics-style` |
| Menus, windows, shortcuts | `test:collection-menus`, `test:context-menu-utils`, `test:tray-popup`, `test:title-bar-window-state`, `test:shortcut-settings` |
| Sync and Bilibili parts | `test:sync-protocol-upgrade`, `test:history-sync`, `test:bili-video-skip`, `test:bili-video-skip-store`, `test:bili-video-skip-runtime`, `test:bili-video-skip-dialog` |
| Listen Together | `test:listen-together-protocol`, `test:listen-together-queue`, `test:listen-together-sync`, `test:listen-together-reconnect`, `test:listen-together-store` |
| FFmpeg configuration | `test:ffmpeg-bundle` |

Run each with `pnpm <entry-point>`; `package.json` contains the full list. Rust supports filters:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib sync
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib listen_together
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib library::local_file_tags::tests
```

FFmpeg tests may skip when libraries are missing. Require actual decoding with `NERI_FFMPEG_DIR` and `NERI_REQUIRE_FFMPEG=1`; see [FFmpeg README](./src-tauri/native/ffmpeg/README.md).

The Android JVM reverse-decoding helper requires PowerShell 7, Node, Python, Java, Android sources, and existing Gradle caches for the script's Kotlin/kotlinx.serialization versions:

```powershell
./scripts/test-sync-android-interop.ps1 -AndroidRoot <AndroidRepositoryPath> -ExportFixtures
```

It reads Android sources/caches, retains audit output, installs no missing dependencies, and accesses no cloud provider. It does not replace a full Gradle build, provider tests, or device interoperability. Obtain authorization before operating real phones; prefer emulators.

## 📦 Packaging, CI, and releases

Ordinary `pnpm tauri build` builds the app but does not automatically download or bundle FFmpeg. Prepare libraries following the [FFmpeg README](./src-tauri/native/ffmpeg/README.md), generate configuration, and merge it. For Windows x64:

```powershell
node scripts/ffmpeg/bundle-config.mjs windows-x86_64
pnpm tauri build --config .cache/ffmpeg-build/windows-x86_64/tauri.bundle.json -- --locked
```

Without `--target`, bundles default to `src-tauri/target/release/bundle/`. Explicit targets use `src-tauri/target/<RustTarget>/release/bundle/`; `CARGO_TARGET_DIR` changes the root.

| Platform | Rust target | FFmpeg target | Release assets |
| --- | --- | --- | --- |
| Windows x64 | `x86_64-pc-windows-msvc` | `windows-x86_64` | NSIS `.exe`, `.msi` |
| macOS Apple Silicon | `aarch64-apple-darwin` | `macos-aarch64` | `.dmg`, release minimum system setting 11.0 |
| macOS Intel | `x86_64-apple-darwin` | `macos-x86_64` | `.dmg`, release minimum system setting 10.15 |
| Linux x64 | `x86_64-unknown-linux-gnu` | `linux-x86_64` | `.deb`, `.rpm`, `.AppImage.tar.gz` |

macOS uses ad-hoc signing without Apple notarization. Release sets per-architecture minimum OS versions, checks signatures/library architectures, and adds `-adhoc` to DMGs. The base `tauri.conf.json` setting is 10.15; local arm64 release builds should mirror the workflow with `MACOSX_DEPLOYMENT_TARGET=11.0` and a `bundle.macOS.minimumSystemVersion` override. The base value is not an arm64 support promise. Linux produces `.AppImage` locally; workflows upload it compressed as `.tar.gz`.

- **`build.yml` / CI**: main/master pushes and PRs or manual dispatch; runs `pnpm test`, `pnpm build`, and locked Rust checks for four targets. Bundled decoder tests cover Windows x64, macOS arm64, and Linux x64. It does not run the full Rust unit suite or Clippy.
- **`artifacts.yml` / Artifacts**: main/master pushes or manual dispatch; four platform test packages with shared metadata. Packages are retained for 3 days and build metadata for 14 days. No GitHub Release publication.
- **`ffmpeg.yml` / FFmpeg**: reusable or manual workflow building four library sets as `ffmpeg-<FFmpegTarget>`.
- **`release.yml` / Release**: `v*` tags or manual `target_ref`; the manual path generates a build version tag. Tag-triggered releases with hyphenated tags are marked prerelease. **Project preview status and GitHub's prerelease flag are separate concepts.**

CI and Artifacts ignore documentation-only, Markdown, license, and template changes; missing runs do not mean checks passed. Release builds and inspects packages, attaching FFmpeg source/build script, macOS installation notes, and `SHA256SUMS.txt`. Package inspection does not replace native testing after installation.

Settings displays `<7-characterGitHash>.<MMddHHmm>` (UTC+8; CI uses Asia/Taipei), plus UUID and timestamp. `1.0.0` in package/Cargo metadata does not establish a stable 1.0 release. `run-tauri.mjs` supplies `NERI_BUILD_EPOCH`; CI shares `NERI_BUILD_GIT_SHA` and `NERI_BUILD_UUID` across packages. Fixed metadata does not establish byte-for-byte reproducible binaries.

## 🤝 Pull requests and safety

Read source/docs and inspect `git status` before editing; preserve existing uncommitted work. Keep changes focused and add regressions that reproduce bugs. Do not delete valid tests, suppress new warnings, or upgrade unrelated dependencies.

Use the [PR template](./.github/PULL_REQUEST_TEMPLATE.md) strictly. Describe motivation, scope, compatibility, commands actually run/results, and unverified checks with reasons. Include screenshots/recordings for UI changes. Use English Conventional Commits for commit messages and PR titles, such as `fix(player): preserve track identity during fallback`, and keep documentation bilingual.

Never commit or publish cookies, tokens, passwords, private libraries, full configuration exports, databases, or sensitive logs. Full exports can include authorization and sync credentials. Exclude `dist/`, `src-tauri/target/`, `.cache/`, `.report/`, `docs-private/`, and local IDE configuration.

## ⚖️ License and communication

- The project is for learning and research; follow source platform rules and applicable laws. Maintainers accept no sponsorship, donations, or commercial funding.
- Contributions use **GPL-3.0-or-later**. MIT contributions before 2026-10-07 retain the [original notice](./LICENSES/MIT.txt).
- `vendor/applemusic-like-lyrics` follows its AGPL-3.0 license. Retain bundled FFmpeg's LGPL notice, source, and build script.
- Retain Android copyright/license notices and identify sources/reference revisions when porting code.

Use [Issues](https://github.com/cwuom/NeriPlayer-Desktop/issues) and follow [community standards](./CODE_OF_CONDUCT.md). Discuss major architecture, sync model, or Listen Together changes in an issue first.

