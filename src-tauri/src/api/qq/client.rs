use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::api::transport::FallbackHttp;
use crate::error::{AppError, AppResult};

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

pub struct QqMusicClient {
    http: FallbackHttp,
    credential: Option<qqmusic_api::Credential>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QqSongUrl {
    pub url: Option<String>,
    pub bitrate: u64,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QqSearchResult {
    pub song_mid: String,
    pub song_name: String,
    pub artists: Vec<String>,
    pub album_name: String,
    pub album_mid: Option<String>,
    pub singer_mid: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Deserialize)]
struct QqLyricResponse {
    lyric: Option<String>,
    trans: Option<String>,
}

impl QqMusicClient {
    pub fn with_transport(http: FallbackHttp) -> Self {
        Self {
            http,
            credential: None,
        }
    }

    pub fn new(http: &Client) -> Self {
        Self::with_transport(FallbackHttp::new(http, "qq"))
    }

    pub fn with_credential(mut self, credential: Option<qqmusic_api::Credential>) -> Self {
        self.credential = credential;
        self
    }

    pub fn api(&self) -> AppResult<qqmusic_api::Client> {
        Ok(qqmusic_api::Client::new_with_transport(
            self.credential.clone(),
            Some(qqmusic_api::Platform::Web),
            std::sync::Arc::new(QqApiTransport(self.http.clone())),
        ))
    }

    pub async fn search(
        &self,
        keyword: &str,
        page: u32,
        limit: u32,
    ) -> AppResult<Vec<QqSearchResult>> {
        let songs = self
            .api()?
            .search
            .search_songs(keyword, limit.into(), page.into())
            .await
            .map_err(|error| qq_api_error("search", &error))?;
        Ok(songs
            .into_iter()
            .map(|song| QqSearchResult {
                song_mid: song.mid,
                song_name: if song.title.is_empty() {
                    song.name
                } else {
                    song.title
                },
                singer_mid: song
                    .singer
                    .iter()
                    .find(|s| !s.mid.is_empty())
                    .map(|s| s.mid.clone()),
                artists: song.singer.into_iter().map(|s| s.name).collect(),
                album_name: if song.album.title.is_empty() {
                    song.album.name
                } else {
                    song.album.title
                },
                album_mid: Some(song.album.mid).filter(|mid| !mid.is_empty()),
                duration_ms: song.interval.max(0) as u64 * 1000,
            })
            .collect())
    }

    pub async fn get_lyrics(&self, song_mid: &str) -> AppResult<(Option<String>, Option<String>)> {
        let response_text = self
            .http
            .send(|client| {
                client
                    .get("https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg")
                    .query(&[
                        ("songmid", song_mid),
                        ("format", "json"),
                        ("inCharset", "utf8"),
                        ("outCharset", "utf-8"),
                        ("nobase64", "1"),
                        ("g_tk", "5381"),
                    ])
                    .header("User-Agent", USER_AGENT)
                    .header("Referer", "https://y.qq.com")
            })
            .await?
            .text()
            .await?;
        let response: QqLyricResponse = serde_json::from_str(&unwrap_jsonp(&response_text)?)?;

        Ok((
            decode_qq_lyric_payload(response.lyric),
            strip_untranslated_placeholder_lines(decode_qq_lyric_payload(response.trans)),
        ))
    }

    pub async fn get_song_url(&self, song_mid: &str, quality: &str) -> AppResult<QqSongUrl> {
        use qqmusic_api::modules::song::{SongFileInfo, SongFileType};
        let api = self.api()?;
        let song = api
            .song
            .get_detail(song_mid)
            .await
            .map_err(|error| qq_api_error("song details", &error))?
            .track;
        // YAQMC uses the Android CGI contract for clear vkeys; metadata stays Web.
        let api = qqmusic_api::Client::new_with_transport(
            self.credential.clone(),
            Some(qqmusic_api::Platform::Android),
            std::sync::Arc::new(QqApiTransport(self.http.clone())),
        );
        let mut file = SongFileInfo::new(song_mid).with_song_type(song.r#type);
        if !song.file.media_mid.is_empty() {
            file = file.with_media_mid(&song.file.media_mid);
        }
        let candidates = match quality {
            "lossless" | "flac" => vec![
                (SongFileType::Flac, 0, "flac"),
                (SongFileType::Mp3_320, 320_000, "mp3"),
                (SongFileType::Mp3_128, 128_000, "mp3"),
                (SongFileType::Acc96, 96_000, "m4a"),
            ],
            "high" | "exhigh" | "320k" => vec![
                (SongFileType::Mp3_320, 320_000, "mp3"),
                (SongFileType::Mp3_128, 128_000, "mp3"),
                (SongFileType::Acc96, 96_000, "m4a"),
            ],
            _ => vec![
                (SongFileType::Mp3_128, 128_000, "mp3"),
                (SongFileType::Acc96, 96_000, "m4a"),
            ],
        };
        for (file_type, bitrate, format) in candidates {
            let result = api
                .song
                .get_song_urls(
                    std::slice::from_ref(&file),
                    &file_type,
                    self.credential.as_ref(),
                )
                .await
                .map_err(|error| qq_api_error("playback authorization", &error))?;
            if let Some(info) = result
                .data
                .into_iter()
                .find(|item| item.mid == song_mid && item.result == 0 && !item.purl.is_empty())
            {
                let url = normalize_playback_url(&info.purl)?;
                return Ok(QqSongUrl {
                    url: Some(url),
                    bitrate,
                    format: format.into(),
                });
            }
        }
        Ok(QqSongUrl {
            url: None,
            bitrate: 0,
            format: String::new(),
        })
    }
}

pub(crate) fn qq_api_error(operation: &str, error: &qqmusic_api::QmError) -> AppError {
    use qqmusic_api::QmError;
    let reason = match error {
        QmError::GlobalApi { code, .. } | QmError::CgiApi { code, .. } => {
            format!("platform code {code}")
        }
        QmError::Http { status, .. } => format!("HTTP {status}"),
        QmError::Network(error) => format!("network {:?}", error.kind),
        QmError::Protocol { stage, .. } => format!("protocol {stage}"),
        QmError::Deserialize(_) => "response schema changed".into(),
        _ => format!("{:?}", error.category()),
    };
    AppError::Api(format!("QQ Music {operation} failed ({reason})"))
}

fn normalize_playback_url(purl: &str) -> AppResult<String> {
    let raw = if purl.starts_with("https://") || purl.starts_with("http://") {
        purl.replacen("http://", "https://", 1)
    } else {
        format!(
            "https://dl.stream.qqmusic.qq.com/{}",
            purl.trim_start_matches('/')
        )
    };
    let url =
        url::Url::parse(&raw).map_err(|_| AppError::Api("Invalid QQ Music playback URL".into()))?;
    if url.scheme() != "https"
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
        || !url.host_str().is_some_and(|host| {
            host.ends_with(".stream.qqmusic.qq.com") || host.ends_with(".music.tc.qq.com")
        })
    {
        return Err(AppError::Api("QQ Music playback host rejected".into()));
    }
    Ok(url.to_string())
}

/// Keep YAQMC's typed protocol behind NeriPlayer's proxy fallback. Clients passed
/// here must disable redirects and ambient cookies (AppState's sync clients).
struct QqApiTransport(FallbackHttp);

#[async_trait::async_trait]
impl qqmusic_api::ApiTransport for QqApiTransport {
    async fn execute(
        &self,
        request: qqmusic_api::TransportRequest,
    ) -> qqmusic_api::Result<qqmusic_api::TransportResponse> {
        use qqmusic_api::{HttpBody, HttpMethod, QmError, RetryClass};
        let url =
            url::Url::parse(&request.url).map_err(|_| QmError::ValueError("invalid URL".into()))?;
        if url.scheme() != "https"
            || url.port_or_known_default() != Some(443)
            || !url.username().is_empty()
            || url.password().is_some()
            || !matches!(
                url.host_str(),
                Some("u.y.qq.com" | "c.y.qq.com" | "y.qq.com" | "api.tencentmusic.com")
            )
        {
            return Err(QmError::ValueError("QQ Music API host".into()));
        }
        let build = |client: &Client| {
            let method = match request.method {
                HttpMethod::Get => reqwest::Method::GET,
                HttpMethod::Post => reqwest::Method::POST,
                HttpMethod::Put => reqwest::Method::PUT,
                HttpMethod::Head => reqwest::Method::HEAD,
                HttpMethod::Delete => reqwest::Method::DELETE,
                HttpMethod::Patch => reqwest::Method::PATCH,
            };
            let mut builder = client
                .request(method, url.clone())
                .query(&request.query)
                .timeout(
                    request
                        .timeout
                        .unwrap_or(std::time::Duration::from_secs(20)),
                );
            for (name, value) in &request.headers {
                builder = builder.header(name, value);
            }
            match &request.body {
                HttpBody::Empty => builder,
                HttpBody::Json(value) => builder.json(value),
                HttpBody::Form(value) => {
                    let pairs: Vec<_> = value
                        .as_object()
                        .into_iter()
                        .flat_map(|map| map.iter())
                        .map(|(key, value)| {
                            (
                                key.clone(),
                                value
                                    .as_str()
                                    .map(str::to_owned)
                                    .unwrap_or_else(|| value.to_string()),
                            )
                        })
                        .collect();
                    builder.form(&pairs)
                }
                HttpBody::Bytes(bytes) => builder.body(bytes.clone()),
            }
        };
        let response = tokio::select! {
            _ = request.cancellation.cancelled() => return Err(QmError::Network(qqmusic_api::NetworkError { kind: qqmusic_api::NetworkErrorKind::Cancelled, message: "QQ Music request cancelled".into() })),
            result = async {
                if matches!(request.retry, RetryClass::SafeRead) { self.0.send(build).await }
                else { self.0.send_once(build).await }
            } => result.map_err(|_| QmError::Protocol { stage: "neri-transport", message: "QQ Music network request failed".into() })?,
        };
        if response.url() != &url || response.status().is_redirection() {
            return Err(QmError::Protocol {
                stage: "neri-transport",
                message: "QQ Music redirect rejected".into(),
            });
        }
        let status = response.status().as_u16();
        let final_url = response.url().to_string();
        let headers = response
            .headers()
            .iter()
            .filter_map(|(key, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|v| (key.to_string(), v.to_string()))
            })
            .collect();
        let max = request.max_response_bytes.unwrap_or(4 * 1024 * 1024);
        let mut response = response;
        let mut body = Vec::new();
        loop {
            let chunk = tokio::select! {
                _ = request.cancellation.cancelled() => return Err(QmError::Network(qqmusic_api::NetworkError { kind: qqmusic_api::NetworkErrorKind::Cancelled, message: "QQ Music request cancelled".into() })),
                chunk = response.chunk() => chunk.map_err(|_| QmError::Protocol { stage: "neri-transport", message: "QQ Music response read failed".into() })?,
            };
            let Some(chunk) = chunk else { break };
            if body.len().saturating_add(chunk.len()) > max {
                return Err(QmError::Protocol {
                    stage: "neri-transport",
                    message: "QQ Music response too large".into(),
                });
            }
            body.extend_from_slice(&chunk);
        }
        Ok(qqmusic_api::TransportResponse {
            status,
            final_url,
            headers,
            body,
        })
    }
}

fn unwrap_jsonp(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    if trimmed.starts_with('{') {
        return Ok(trimmed.to_string());
    }

    let start = trimmed
        .find('{')
        .ok_or_else(|| AppError::Api("QQ search response missing JSON body".into()))?;
    let end = trimmed
        .rfind('}')
        .ok_or_else(|| AppError::Api("QQ search response missing JSON end".into()))?;
    if end <= start {
        return Err(AppError::Api("QQ search JSONP format invalid".into()));
    }

    Ok(trimmed[start..=end].to_string())
}

fn decode_qq_lyric_payload(input: Option<String>) -> Option<String> {
    let raw = input?.trim().to_string();
    if raw.is_empty() {
        return None;
    }

    let unescaped = html_unescape(&raw);
    if let Some(decoded) = decode_base64_lrc(&unescaped) {
        return Some(html_unescape(&decoded));
    }
    Some(unescaped)
}

// QQ 用只含 // 的一行表示这句未翻译，原样保留会在歌词视图里显示成整排斜杠
// 去掉时间标签后内容恰为 // 的行整行丢弃，其余翻译行仍各自对准原句
fn strip_untranslated_placeholder_lines(input: Option<String>) -> Option<String> {
    let source = input?;
    let filtered = source
        .lines()
        .filter(|line| {
            let content = match line.rfind(']') {
                Some(idx) => &line[idx + 1..],
                None => line,
            };
            content.trim() != "//"
        })
        .collect::<Vec<_>>()
        .join("\n");
    if filtered.trim().is_empty() {
        None
    } else {
        Some(filtered)
    }
}

fn decode_base64_lrc(value: &str) -> Option<String> {
    if !value.len().is_multiple_of(4) {
        return None;
    }
    if !value.chars().all(|c| {
        c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=' || c == '\r' || c == '\n'
    }) {
        return None;
    }

    let decoded = STANDARD.decode(value.as_bytes()).ok()?;
    let as_text = String::from_utf8(decoded).ok()?;
    if as_text.contains('[') || as_text.contains('\n') || as_text.contains('\r') {
        return Some(as_text);
    }
    None
}

fn html_unescape(value: &str) -> String {
    value
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qq_playback_urls_only_accept_music_cdns() {
        assert_eq!(
            normalize_playback_url("M500test.mp3?vkey=fixture").unwrap(),
            "https://dl.stream.qqmusic.qq.com/M500test.mp3?vkey=fixture"
        );
        assert!(
            normalize_playback_url("http://ws.stream.qqmusic.qq.com/test.mp3")
                .unwrap()
                .starts_with("https://")
        );
        for url in [
            "https://evil.example/test",
            "https://dl.stream.qqmusic.qq.com.evil.example/test",
            "https://user@dl.stream.qqmusic.qq.com/test",
            "https://dl.stream.qqmusic.qq.com:444/test",
        ] {
            assert!(normalize_playback_url(url).is_err());
        }
    }

    #[tokio::test]
    async fn qq_api_rejects_untrusted_hosts_before_network() {
        let http = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let transport = QqApiTransport(FallbackHttp::new(&http, "qq-test"));
        for url in [
            "https://u.y.qq.com.evil.example/",
            "http://u.y.qq.com/",
            "https://user@u.y.qq.com/",
        ] {
            let result = qqmusic_api::ApiTransport::execute(
                &transport,
                qqmusic_api::TransportRequest::new(qqmusic_api::HttpMethod::Get, url),
            )
            .await;
            assert!(result.is_err());
        }
    }

    #[tokio::test]
    #[ignore = "requires live QQ Music network access"]
    async fn qq_live_search_lyrics_and_playback() {
        let http = Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let client = QqMusicClient::new(&http);
        let songs = client.search("晴天", 1, 5).await.unwrap();
        assert!(!songs.is_empty());
        assert!(songs.iter().all(|song| !song.song_mid.is_empty()
            && !song.song_name.is_empty()
            && song.duration_ms > 0));
        let (lyric, _) = client.get_lyrics(&songs[0].song_mid).await.unwrap();
        assert!(lyric.is_some());
        // Paid tracks may legitimately return no URL for a visitor. Search a
        // public-domain performance too and require one actual decoded stream.
        let songs = client.search("两只老虎", 1, 10).await.unwrap();
        let mut playable = None;
        for song in songs.iter().take(10) {
            let result = client
                .get_song_url(&song.song_mid, "standard")
                .await
                .unwrap();
            if let Some(url) = result.url {
                playable = Some(url);
                break;
            }
        }
        let response = http
            .get(playable.expect("one visitor-playable result"))
            .header("Referer", "https://y.qq.com/")
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap();
        let bytes = response.bytes().await.unwrap();
        assert!(bytes.len() > 1024);
        use symphonia::core::{
            codecs::DecoderOptions, formats::FormatOptions, io::MediaSourceStream,
            meta::MetadataOptions, probe::Hint,
        };
        let stream = MediaSourceStream::new(
            Box::new(std::io::Cursor::new(bytes.to_vec())),
            Default::default(),
        );
        let mut format = symphonia::default::get_probe()
            .format(
                &Hint::new(),
                stream,
                &FormatOptions::default(),
                &MetadataOptions::default(),
            )
            .unwrap()
            .format;
        let track = format.default_track().unwrap();
        let track_id = track.id;
        let mut decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .unwrap();
        loop {
            let packet = format.next_packet().unwrap();
            if packet.track_id() == track_id && decoder.decode(&packet).is_ok() {
                break;
            }
        }
    }
}
