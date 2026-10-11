// 平台登录状态数据结构
use serde::{Deserialize, Serialize};

/// 全局登录状态
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AuthState {
    #[serde(default)]
    pub qq: Option<QqAuth>,
    pub netease: Option<NeteaseAuth>,
    pub bilibili: Option<BiliAuth>,
    pub youtube: Option<YouTubeAuth>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QqAuth {
    pub credential: qqmusic_api::Credential,
    pub expires_at_ms: u64,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
}

impl QqAuth {
    pub fn info(&self) -> AuthInfo {
        AuthInfo {
            platform: "qq".into(),
            logged_in: self.expires_at_ms > chrono::Utc::now().timestamp_millis() as u64
                && !self.credential.musickey.is_empty(),
            nickname: self.nickname.clone(),
            avatar_url: self.avatar_url.clone(),
        }
    }
}

/// 网易云登录凭证
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeteaseAuth {
    pub cookies: Vec<CookieEntry>,
    pub user_id: Option<u64>,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
}

/// B站登录凭证
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiliAuth {
    pub cookies: Vec<CookieEntry>,
    pub mid: Option<u64>,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
}

/// YouTube Music 登录凭证
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeAuth {
    pub cookies: Vec<CookieEntry>,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
}

/// 持久化的单条 Cookie
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CookieEntry {
    pub name: String,
    pub value: String,
    pub domain: String,
}

impl NeteaseAuth {
    /// 检查是否有有效的 MUSIC_U Cookie
    pub fn has_login(&self) -> bool {
        self.cookies.iter().any(|c| c.name == "MUSIC_U" && !c.value.is_empty())
    }
}

impl BiliAuth {
    /// 检查是否有有效的 SESSDATA Cookie
    pub fn has_login(&self) -> bool {
        self.cookies.iter().any(|c| c.name == "SESSDATA" && !c.value.is_empty())
    }
}

impl YouTubeAuth {
    /// 检查是否有 SAPISID 或 __Secure-3PAPISID
    pub fn has_login(&self) -> bool {
        self.cookies.iter().any(|c| {
            (c.name == "SAPISID" || c.name == "__Secure-3PAPISID") && !c.value.is_empty()
        })
    }

    /// 获取 SAPISID 值（优先 SAPISID，fallback __Secure-3PAPISID）
    pub fn get_sapisid(&self) -> Option<&str> {
        self.cookies.iter()
            .find(|c| c.name == "SAPISID")
            .or_else(|| self.cookies.iter().find(|c| c.name == "__Secure-3PAPISID"))
            .map(|c| c.value.as_str())
    }
}

/// 前端友好的登录状态摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthInfo {
    pub platform: String,
    pub logged_in: bool,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
}

/// 平台登录状态聚合响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatusResponse {
    pub qq: AuthInfo,
    pub netease: AuthInfo,
    pub bilibili: AuthInfo,
    pub youtube: AuthInfo,
}

impl AuthState {
    /// 生成前端状态摘要
    pub fn to_status_response(&self) -> AuthStatusResponse {
        AuthStatusResponse {
            qq: self.qq.as_ref().map(QqAuth::info).unwrap_or(AuthInfo {
                platform: "qq".into(),
                logged_in: false,
                nickname: None,
                avatar_url: None,
            }),
            netease: match &self.netease {
                Some(a) => AuthInfo {
                    platform: "netease".into(),
                    logged_in: a.has_login(),
                    nickname: a.nickname.clone(),
                    avatar_url: a.avatar_url.clone(),
                },
                None => AuthInfo {
                    platform: "netease".into(),
                    logged_in: false,
                    nickname: None,
                    avatar_url: None,
                },
            },
            bilibili: match &self.bilibili {
                Some(a) => AuthInfo {
                    platform: "bilibili".into(),
                    logged_in: a.has_login(),
                    nickname: a.nickname.clone(),
                    avatar_url: a.avatar_url.clone(),
                },
                None => AuthInfo {
                    platform: "bilibili".into(),
                    logged_in: false,
                    nickname: None,
                    avatar_url: None,
                },
            },
            youtube: match &self.youtube {
                Some(a) => AuthInfo {
                    platform: "youtube".into(),
                    logged_in: a.has_login(),
                    nickname: a.nickname.clone(),
                    avatar_url: a.avatar_url.clone(),
                },
                None => AuthInfo {
                    platform: "youtube".into(),
                    logged_in: false,
                    nickname: None,
                    avatar_url: None,
                },
            },
        }
    }
}

#[cfg(test)]
mod qq_auth_tests {
    use super::*;

    #[test]
    fn qq_credentials_restore_without_breaking_old_auth_data() {
        let legacy: AuthState =
            serde_json::from_str(r#"{"netease":null,"bilibili":null,"youtube":null}"#).unwrap();
        assert!(legacy.qq.is_none());
        let auth = AuthState {
            qq: Some(QqAuth {
                credential: qqmusic_api::Credential {
                    musicid: 123,
                    musickey: "fixture-only".into(),
                    ..Default::default()
                },
                expires_at_ms: chrono::Utc::now().timestamp_millis() as u64 + 60_000,
                nickname: Some("test account".into()),
                avatar_url: None,
            }),
            ..Default::default()
        };
        let serialized = serde_json::to_string(&auth).unwrap();
        let restored: AuthState = serde_json::from_str(&serialized).unwrap();
        let status = restored.to_status_response();
        assert!(status.qq.logged_in);
        assert_eq!(status.qq.nickname.as_deref(), Some("test account"));
        let public = serde_json::to_string(&status).unwrap();
        assert!(!public.contains("fixture-only"));
        assert!(!public.contains("musickey"));
        let mut expired = restored;
        expired.qq.as_mut().unwrap().expires_at_ms = 0;
        assert!(!expired.to_status_response().qq.logged_in);
    }
}
