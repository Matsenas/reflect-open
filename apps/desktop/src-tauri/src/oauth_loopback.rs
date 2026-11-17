//! A loopback listener for OAuth sign-ins that finish in the system browser.
//!
//! Google only lets a desktop OAuth client redirect to `http://127.0.0.1:<port>`,
//! so the sign-in needs a short-lived local HTTP listener to receive the
//! authorization code. This module is that capability and nothing more: it
//! hands back the redirect's query string. Building the consent URL, checking
//! `state`, and exchanging the code are the caller's policy
//! (`apps/desktop/src/features/google-calendar/`).

use std::io::{ErrorKind, Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use crate::blocking::run_blocking;
use crate::error::{AppError, AppResult};

/// How long a sign-in may sit in the browser before the listener gives up.
const WAIT_TIMEOUT: Duration = Duration::from_secs(300);
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const READ_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_REQUEST_BYTES: usize = 8 * 1024;

/// Identifies the newest sign-in. Starting or cancelling one bumps it, which
/// ends the wait of any older one.
static CURRENT_FLOW: AtomicU64 = AtomicU64::new(0);

/// The listener bound by `oauth_loopback_start`, until `oauth_loopback_wait`
/// takes it.
static PENDING: Mutex<Option<(u64, TcpListener)>> = Mutex::new(None);

fn pending() -> MutexGuard<'static, Option<(u64, TcpListener)>> {
    PENDING.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Command: bind a listener on a free loopback port and return the port, to
/// build the redirect URI from. Replaces any sign-in still in progress.
#[tauri::command]
pub fn oauth_loopback_start() -> AppResult<u16> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    let flow = CURRENT_FLOW.fetch_add(1, Ordering::SeqCst) + 1;
    *pending() = Some((flow, listener));
    Ok(port)
}

/// Command: wait for the browser's redirect to the started listener and return
/// its query string (`code=…&state=…`, or `error=…`). `None` means the sign-in
/// was cancelled or replaced by a newer one.
#[tauri::command]
pub async fn oauth_loopback_wait() -> AppResult<Option<String>> {
    let Some((flow, listener)) = pending().take() else {
        return Err(AppError::io("no sign-in is waiting for a redirect"));
    };
    run_blocking(move || {
        wait_for_callback(
            &listener,
            || CURRENT_FLOW.load(Ordering::SeqCst) != flow,
            WAIT_TIMEOUT,
        )
    })
    .await
}

/// Command: stop the sign-in in progress, if any.
#[tauri::command]
pub fn oauth_loopback_cancel() {
    CURRENT_FLOW.fetch_add(1, Ordering::SeqCst);
    pending().take();
}

fn wait_for_callback(
    listener: &TcpListener,
    is_cancelled: impl Fn() -> bool,
    timeout: Duration,
) -> AppResult<Option<String>> {
    let deadline = Instant::now() + timeout;
    loop {
        if is_cancelled() {
            return Ok(None);
        }
        if Instant::now() >= deadline {
            return Err(AppError::Auth {
                message: "The sign-in timed out. Try again.".into(),
            });
        }
        match listener.accept() {
            Ok((stream, _)) => {
                // A browser also asks for things like /favicon.ico; only the
                // redirect itself ends the wait.
                if let Some(query) = answer(stream) {
                    return Ok(Some(query));
                }
            }
            Err(err) if err.kind() == ErrorKind::WouldBlock => std::thread::sleep(POLL_INTERVAL),
            Err(err) => return Err(err.into()),
        }
    }
}

/// Read one request, reply to it, and return the redirect's query string when
/// the request was the OAuth redirect. A connection that fails mid-way is
/// treated as not the redirect: the browser retries, or the wait times out.
fn answer(mut stream: TcpStream) -> Option<String> {
    // An accepted socket can inherit the listener's non-blocking mode.
    stream.set_nonblocking(false).ok()?;
    stream.set_read_timeout(Some(READ_TIMEOUT)).ok()?;
    let request_line = read_request_line(&mut stream)?;
    let query = callback_query(&request_line);
    let (status, body) = match &query {
        Some(query) if has_param(query, "code") => (
            "200 OK",
            "Sign-in received. You can close this tab and return to Reflect.",
        ),
        Some(_) => (
            "200 OK",
            "The sign-in was not completed. You can close this tab and try again in Reflect.",
        ),
        None => ("404 Not Found", "Not found."),
    };
    let page = format!(
        "<!doctype html><meta charset=\"utf-8\"><title>Reflect</title>\
         <body style=\"font:16px system-ui;margin:4rem auto;max-width:28rem;text-align:center\">\
         <p>{body}</p></body>"
    );
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{page}",
        page.len()
    );
    // The code already arrived; a browser that hung up early changes nothing.
    let _ = stream.write_all(response.as_bytes());
    query
}

fn read_request_line(stream: &mut TcpStream) -> Option<String> {
    let mut request = Vec::new();
    let mut chunk = [0_u8; 1024];
    while !request.contains(&b'\n') && request.len() < MAX_REQUEST_BYTES {
        let read = stream.read(&mut chunk).ok()?;
        if read == 0 {
            break;
        }
        request.extend_from_slice(&chunk[..read]);
    }
    let text = String::from_utf8_lossy(&request);
    text.lines().next().map(str::to_owned)
}

/// The query string of an HTTP request line, when it is an OAuth redirect:
/// a `GET` carrying a `code` or an `error` parameter.
fn callback_query(request_line: &str) -> Option<String> {
    let mut parts = request_line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    let (_, query) = parts.next()?.split_once('?')?;
    (has_param(query, "code") || has_param(query, "error")).then(|| query.to_owned())
}

fn has_param(query: &str, name: &str) -> bool {
    query
        .split('&')
        .any(|pair| pair.split('=').next() == Some(name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_redirect_carries_a_callback_query() {
        assert_eq!(
            callback_query("GET /?state=abc&code=4/xyz HTTP/1.1").as_deref(),
            Some("state=abc&code=4/xyz")
        );
        assert_eq!(
            callback_query("GET /?error=access_denied&state=abc HTTP/1.1").as_deref(),
            Some("error=access_denied&state=abc")
        );
        assert_eq!(callback_query("GET /favicon.ico HTTP/1.1"), None);
        assert_eq!(callback_query("GET /?barcode=1 HTTP/1.1"), None);
        assert_eq!(callback_query("POST /?code=1 HTTP/1.1"), None);
        assert_eq!(callback_query(""), None);
    }

    fn request(port: u16, target: &str) -> String {
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
        stream
            .write_all(format!("GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").as_bytes())
            .unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        response
    }

    #[test]
    fn waits_past_other_requests_for_the_redirect() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();

        let browser = std::thread::spawn(move || {
            let favicon = request(port, "/favicon.ico");
            let redirect = request(port, "/?state=abc&code=4/xyz");
            (favicon, redirect)
        });
        let query = wait_for_callback(&listener, || false, Duration::from_secs(10)).unwrap();
        let (favicon, redirect) = browser.join().unwrap();

        assert_eq!(query.as_deref(), Some("state=abc&code=4/xyz"));
        assert!(favicon.starts_with("HTTP/1.1 404"));
        assert!(redirect.starts_with("HTTP/1.1 200"));
        assert!(redirect.contains("Sign-in received"));
    }

    #[test]
    fn a_cancelled_wait_ends_without_a_query() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        assert_eq!(
            wait_for_callback(&listener, || true, Duration::from_secs(10)).unwrap(),
            None
        );
    }

    #[test]
    fn an_unanswered_wait_times_out_as_an_auth_error() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let result = wait_for_callback(&listener, || false, Duration::ZERO);
        assert!(matches!(result, Err(AppError::Auth { .. })));
    }
}
