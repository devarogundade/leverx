use std::collections::HashSet;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;

use crate::routes::AppState;
use crate::stream::{parse_channel, stream_message_json, ws_json, StreamHub};

#[derive(Debug, Deserialize)]
struct ClientMessage {
    op: String,
    #[serde(default)]
    channels: Vec<String>,
}

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut subscribed: HashSet<String> = HashSet::new();
    let mut hub_rx = state.stream.subscribe();

    if sender
        .send(Message::Text(ws_json("connected", None, None, None, None).into()))
        .await
        .is_err()
    {
        return;
    }

    loop {
        tokio::select! {
            incoming = receiver.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if let Err(msg) = handle_client_message(
                            &state,
                            &mut subscribed,
                            &mut sender,
                            &text,
                        ).await {
                            let _ = sender
                                .send(Message::Text(ws_json("error", None, None, None, Some(msg)).into()))
                                .await;
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if sender.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            hub_msg = hub_rx.recv() => {
                match hub_msg {
                    Ok(msg) => {
                        if msg.channel == "_system" {
                            if msg.msg_type == "heartbeat" {
                                let _ = sender
                                    .send(Message::Text(ws_json("heartbeat", None, None, None, None).into()))
                                    .await;
                            }
                            continue;
                        }
                        if subscribed.contains(&msg.channel) {
                            let _ = sender
                                .send(Message::Text(stream_message_json(&msg).into()))
                                .await;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        }
    }

    if !subscribed.is_empty() {
        let channels: Vec<String> = subscribed.into_iter().collect();
        state.stream.untrack_channels(&channels).await;
    }
}

async fn handle_client_message(
    state: &AppState,
    subscribed: &mut HashSet<String>,
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    text: &str,
) -> Result<(), &'static str> {
    let msg: ClientMessage = serde_json::from_str(text).map_err(|_| "invalid_json")?;

    match msg.op.as_str() {
        "subscribe" => {
            let mut accepted = Vec::new();
            for channel in &msg.channels {
                if parse_channel(channel).is_none() {
                    continue;
                }
                subscribed.insert(channel.clone());
                accepted.push(channel.clone());
                if let Ok(Some(snapshot)) =
                    StreamHub::snapshot_for_channel(&state.pool, channel).await
                {
                    let _ = sender
                        .send(Message::Text(stream_message_json(&snapshot).into()))
                        .await;
                }
            }
            if !accepted.is_empty() {
                state.stream.track_channels(&accepted).await;
                let _ = sender
                    .send(Message::Text(
                        ws_json("subscribed", None, None, Some(accepted), None).into(),
                    ))
                    .await;
            }
        }
        "unsubscribe" => {
            let mut removed = Vec::new();
            for channel in &msg.channels {
                if subscribed.remove(channel) {
                    removed.push(channel.clone());
                }
            }
            if !removed.is_empty() {
                state.stream.untrack_channels(&removed).await;
                let _ = sender
                    .send(Message::Text(
                        ws_json("unsubscribed", None, None, Some(removed), None).into(),
                    ))
                    .await;
            }
        }
        "ping" => {
            let _ = sender
                .send(Message::Text(ws_json("pong", None, None, None, None).into()))
                .await;
        }
        _ => return Err("unknown_op"),
    }

    Ok(())
}
