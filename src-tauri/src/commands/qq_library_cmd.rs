//! YAQMC's typed, account-bound read contract. No remote playlist writes.
use std::collections::HashSet;
use qqmusic_api::{account::{self, AccountRead}, CancellationToken, Credential};
use serde_json::{json, Value};
use tauri::State;
use crate::{error::{AppError, AppResult}, state::AppState};
use crate::api::qq::client::qq_api_error;

fn text(row: &Value, keys: &[&str]) -> String {
    keys.iter().find_map(|key| {
        let value = &row[*key];
        value.as_str().filter(|s| !s.is_empty()).map(str::to_owned)
            .or_else(|| value.as_u64().filter(|v| *v > 0).map(|v| v.to_string()))
    }).unwrap_or_default()
}
fn https(value: String) -> String {
    if value.starts_with("//") { format!("https:{value}") }
    else { value.replacen("http://", "https://", 1) }
}
fn credential(state: &AppState) -> AppResult<Credential> {
    state.auth.lock().qq.as_ref().filter(|auth| auth.info().logged_in)
        .map(|auth| auth.credential.clone())
        .ok_or_else(|| AppError::Api("QQ Music not logged in".into()))
}

async fn rows(api: &qqmusic_api::Client, credential: &Credential, operation: AccountRead) -> AppResult<(Vec<Value>, Value)> {
    let mut offset = 0;
    let mut all = Vec::new();
    let mut metadata = Value::Null;
    for _ in 0..100 {
        let page = account::read_page(api, credential, operation.clone(), offset, 100, CancellationToken::new()).await
            .map_err(|error| qq_api_error("library", &error))?;
        let envelope: Value = serde_json::from_slice(&page.compatibility_json().map_err(|error| qq_api_error("library", &error))?)?;
        let data = &envelope.get("req").or_else(|| envelope.get("req_0"))
            .ok_or_else(|| AppError::Api("QQ Music library response missing envelope".into()))?["data"];
        if metadata.is_null() { metadata = data.clone(); }
        let keys: &[&str] = match operation {
            AccountRead::OwnedPlaylists => &["v_playlist", "playlist"],
            AccountRead::CollectedPlaylists => &["v_list", "v_playlist", "list"],
            _ => &["songlist", "tracks"],
        };
        let items = keys.iter().find_map(|key| data[*key].as_array())
            .or_else(|| data.pointer("/cdlist/0/songlist").and_then(Value::as_array))
            .ok_or_else(|| AppError::Api("QQ Music library response missing rows".into()))?;
        all.extend(items.iter().cloned());
        match page.next_offset {
            Some(next) if next > offset => offset = next,
            None => return Ok((all, metadata)),
            _ => return Err(AppError::Api("QQ Music library pagination stalled".into())),
        }
    }
    Err(AppError::Api("QQ Music library exceeds page limit".into()))
}

fn playlist(row: &Value, owned: bool) -> Option<Value> {
    let id = text(row, &["tid", "dissid", "id"]);
    if id.parse::<u64>().ok().filter(|id| *id > 0).is_none() { return None; }
    Some(json!({
        "id": id, "name": text(row, &["dirName", "dissname", "title", "name"]),
        "coverUrl": https(text(row, &["picUrl", "picurl", "cover", "bigpicUrl", "albumPicUrl"])),
        "trackCount": text(row, &["songNum", "songnum", "song_cnt", "song_count"]).parse::<u64>().unwrap_or(0),
        "creator": text(row, &["nick", "nickname"]), "owned": owned,
        "dirId": text(row, &["dirId", "dirid"]).parse::<u64>().unwrap_or(0),
    }))
}

pub async fn user_playlists(state: &AppState) -> AppResult<Value> {
    let credential = credential(state)?;
    let api = state.qq().with_credential(Some(credential.clone())).api()?;
    let (owned, collected) = tokio::try_join!(
        rows(&api, &credential, AccountRead::OwnedPlaylists),
        rows(&api, &credential, AccountRead::CollectedPlaylists),
    )?;
    let mut seen = HashSet::new();
    let playlists: Vec<_> = owned.0.iter().filter_map(|row| playlist(row, true))
        .chain(collected.0.iter().filter_map(|row| playlist(row, false)))
        .filter(|row| seen.insert(row["id"].as_str().unwrap_or_default().to_owned())).collect();
    Ok(json!({"playlists": playlists}))
}

fn track(row: &Value) -> Option<Value> {
    let row = row.get("musicData").unwrap_or(row);
    let mid = text(row, &["mid", "songmid"]);
    if mid.is_empty() { return None; }
    let artists = row["singer"].as_array().map(|singers| singers.iter()
        .map(|s| text(s, &["name", "title"])).collect::<Vec<_>>().join(" / ")).unwrap_or_default();
    let album_mid = text(&row["album"], &["mid"]).chars().collect::<String>();
    let album_mid = if album_mid.is_empty() { text(row, &["albummid"]) } else { album_mid };
    let cover = if album_mid.is_empty() { String::new() }
        else { format!("https://y.gtimg.cn/music/photo_new/T002R300x300M000{album_mid}.jpg") };
    Some(json!({"id":format!("qq:{mid}"), "title":text(row, &["title", "name", "songname"]),
        "artist":artists, "album":text(&row["album"], &["title", "name"]),
        "durationMs":row["interval"].as_u64().unwrap_or(0) * 1000,
        "coverUrl":cover, "audioUrl":"", "source":"qq"}))
}

#[tauri::command]
pub async fn get_qq_playlist(id: String, state: State<'_, AppState>) -> AppResult<Value> {
    if id.parse::<u64>().ok().filter(|id| *id > 0).is_none() {
        return Err(AppError::Api("Invalid QQ Music playlist ID".into()));
    }
    let credential = match credential(&state) {
        Ok(credential) => credential,
        Err(_) => return public_playlist(&state.qq().api()?, &id).await,
    };
    let api = state.qq().with_credential(Some(credential.clone())).api()?;
    // Directory IDs are trusted only when obtained from this account's listing.
    let (owned, _) = match rows(&api, &credential, AccountRead::OwnedPlaylists).await {
        Ok(result) => result,
        Err(_) => return public_playlist(&api, &id).await,
    };
    let binding = owned.iter().filter_map(|row| playlist(row, true)).find(|row| row["id"] == id);
    let operation = match binding.as_ref().and_then(|row| row["dirId"].as_u64()).filter(|dir| *dir > 0) {
        Some(dir_id) => AccountRead::OwnedPlaylistTracks { tid: id.clone(), dir_id },
        None => AccountRead::PlaylistTracks { tid: id },
    };
    let (songs, data) = rows(&api, &credential, operation).await?;
    let info = data.get("dirinfo").or_else(|| data.pointer("/cdlist/0")).unwrap_or(&Value::Null);
    let summary = binding.or_else(|| playlist(info, false)).unwrap_or(json!({}));
    let mut seen = HashSet::new();
    let tracks: Vec<_> = songs.iter().filter_map(track).filter(|track| seen.insert(track["id"].as_str().unwrap_or_default().to_owned())).collect();
    Ok(json!({"name":summary["name"], "coverUrl":summary["coverUrl"], "tracks":tracks}))
}

// Public search results do not require an account. Never guess an owned directory ID.
async fn public_playlist(api: &qqmusic_api::Client, id: &str) -> AppResult<Value> {
    let id = id.parse::<i64>().ok().filter(|id| *id > 0)
        .ok_or_else(|| AppError::Api("Invalid QQ Music playlist ID".into()))?;
    let mut tracks = Vec::new();
    let mut seen = HashSet::new();
    let mut summary = json!({});
    for page in 1..=100 {
        let detail = api.songlist.get_detail(id, 0, 100, page, false, true, true).await
            .map_err(|error| qq_api_error("playlist detail", &error))?;
        if page == 1 {
            summary = json!({"name":detail.info.base.title,
                "coverUrl":https(detail.info.base.picurl), "description":detail.info.base.desc,
                "creator":detail.info.creator.nick, "playCount":detail.info.base.listennum});
        }
        let before = tracks.len();
        for song in detail.songs {
            let mapped = track(&json!({"mid":song.mid, "title":if song.title.is_empty() { song.name } else { song.title },
                "singer":song.singer.iter().map(|singer| json!({"name":singer.name})).collect::<Vec<_>>(),
                "album":{"mid":song.album.mid,"name":song.album.name}, "interval":song.interval.max(0)}));
            if let Some(song) = mapped {
                if seen.insert(song["id"].as_str().unwrap_or_default().to_owned()) { tracks.push(song); }
            }
        }
        if detail.hasmore == 0 {
            summary["tracks"] = json!(tracks);
            return Ok(summary);
        }
        if tracks.len() == before {
            return Err(AppError::Api("QQ Music playlist pagination stalled".into()));
        }
    }
    Err(AppError::Api("QQ Music playlist exceeds page limit".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn qq_library_maps_ids_counts_covers_and_track_sources() {
        let row = json!({"tid":"123456789012345678", "dirId":301, "dirName":"测试歌单", "picUrl":"http://example.com/a.jpg", "songNum":7});
        let summary = playlist(&row, true).unwrap();
        assert_eq!(summary["id"], "123456789012345678");
        assert_eq!(summary["coverUrl"], "https://example.com/a.jpg");
        assert_eq!(summary["trackCount"], 7);
        assert_eq!(summary["dirId"], 301);
        assert!(playlist(&json!({"tid":0}), false).is_none());
        let song = track(&json!({"mid":"testmid", "title":"测试歌曲", "singer":[{"name":"歌手"}], "album":{"mid":"alb","name":"专辑"}, "interval":120})).unwrap();
        assert_eq!(song["id"], "qq:testmid");
        assert_eq!(song["source"], "qq");
        assert_eq!(song["durationMs"], 120000);
    }
}
