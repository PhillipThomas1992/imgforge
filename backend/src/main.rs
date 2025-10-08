use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Multipart, Path, State,
    },
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    process::Stdio,
    sync::Arc,
};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
    sync::Mutex,
};
use tower_http::{
    cors::CorsLayer,
    services::ServeDir,
    trace::TraceLayer,
};
use tracing::{error, info};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageConfig {
    pub hostname: String,
    pub change_username: bool,
    pub new_username: Option<String>,
    pub set_root_password: bool,
    pub root_password: Option<String>,
    pub enable_ssh: bool,
    pub wifi_ssid: Option<String>,
    pub wifi_password: Option<String>,
    pub board_type: BoardType,
    pub mode: BuildMode,
    pub expand_image: bool,
    pub extra_size: Option<String>,
    pub base_image_url: Option<String>,
    pub preset_image: Option<PresetImage>,
    pub docker_compose_content: Option<String>,
    pub custom_script_content: Option<String>,
    pub inline_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BoardType {
    RaspberryPi,
    Jetson,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BuildMode {
    Flash,
    Artifact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PresetImage {
    RaspberryPiLite,
    RadxaDesktop,
    RadxaServer,
}

#[derive(Debug, Serialize)]
pub struct Device {
    pub name: String,
    pub path: String,
    pub size: String,
    pub removable: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct BuildJob {
    pub id: String,
    pub status: JobStatus,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Running,
    Success,
    Failed,
    Cancelled,
}

#[derive(Clone)]
struct AppState {
    jobs: Arc<Mutex<Vec<BuildJob>>>,
    upload_dir: PathBuf,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    info!("Starting imgforge backend server...");

    // Use ~/.imgforge for persistent storage
    let imgforge_home = std::env::var("IMGFORGE_HOME")
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").expect("HOME environment variable not set");
            format!("{}/.imgforge", home)
        });

    let imgforge_path = PathBuf::from(&imgforge_home);
    fs::create_dir_all(&imgforge_path).expect("Failed to create imgforge home directory");
    fs::create_dir_all(imgforge_path.join("images")).expect("Failed to create images directory");
    fs::create_dir_all(imgforge_path.join("configs")).expect("Failed to create configs directory");

    let upload_dir = PathBuf::from("/tmp/imgforge-uploads");
    fs::create_dir_all(&upload_dir).expect("Failed to create upload directory");

    let state = AppState {
        jobs: Arc::new(Mutex::new(Vec::new())),
        upload_dir,
    };

    let app = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/devices", get(list_devices))
        .route("/api/images", get(list_images))
        .route("/api/wifi-devices", get(list_wifi_devices))
        .route("/api/build", post(create_build))
        .route("/api/flash", post(flash_device))
        .route("/api/jobs", get(list_jobs))
        .route("/api/jobs/:id", get(get_job))
        .route("/api/upload", post(upload_file))
        .route("/api/ws/:job_id", get(ws_handler))
        .nest_service("/", ServeDir::new("/app/frontend"))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let addr = format!("0.0.0.0:{}", port);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|_| panic!("Failed to bind to port {}", port));

    info!("Server listening on http://0.0.0.0:{}", port);

    axum::serve(listener, app)
        .await
        .expect("Server failed to start");
}

async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "imgforge-backend"
    }))
}

async fn list_devices() -> Result<Json<Vec<Device>>, AppError> {
    let output = Command::new("lsblk")
        .args(["-ndo", "NAME,SIZE,TYPE,HOTPLUG"])
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to list devices: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let devices: Vec<Device> = stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 && parts[2] == "disk" && parts[3] == "1" {
                Some(Device {
                    name: parts[0].to_string(),
                    path: format!("/dev/{}", parts[0]),
                    size: parts[1].to_string(),
                    removable: true,
                })
            } else {
                None
            }
        })
        .collect();

    Ok(Json(devices))
}

async fn list_wifi_devices() -> Result<Json<Vec<String>>, AppError> {
    let output = Command::new("bash")
        .args(["-c", "grep -r '^ssid=' /etc/NetworkManager/system-connections/ 2>/dev/null | cut -d= -f2"])
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to list Wi-Fi devices: {}", e)))?;

    // Debugging: Log raw output of the command
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    println!("Debug - Raw stdout: {}", stdout);
    println!("Debug - Raw stderr: {}", stderr);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let wifi_devices: Vec<String> = stdout
        .lines()
        .enumerate()
        .map(|(i, line)| format!("{}: {}", i + 1, line))
        .collect();

    Ok(Json(wifi_devices))
}

async fn list_images() -> Result<Json<serde_json::Value>, AppError> {
    let imgforge_home = std::env::var("IMGFORGE_HOME")
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").expect("HOME environment variable not set");
            format!("{}/.imgforge", home)
        });

    let images_dir = PathBuf::from(&imgforge_home).join("images");

    if !images_dir.exists() {
        return Ok(Json(serde_json::json!({
            "images": []
        })));
    }

    let mut images = Vec::new();

    if let Ok(entries) = fs::read_dir(&images_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    if let Some(filename) = entry.file_name().to_str() {
                        if filename.ends_with(".img") || filename.ends_with(".img.xz") {
                            let size_mb = metadata.len() / 1024 / 1024;
                            let modified = metadata.modified()
                                .ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs());

                            images.push(serde_json::json!({
                                "name": filename,
                                "path": entry.path().to_string_lossy().to_string(),
                                "size_mb": size_mb,
                                "modified": modified,
                            }));
                        }
                    }
                }
            }
        }
    }

    // Sort by modified time (newest first)
    images.sort_by(|a, b| {
        let a_time = a["modified"].as_u64().unwrap_or(0);
        let b_time = b["modified"].as_u64().unwrap_or(0);
        b_time.cmp(&a_time)
    });

    Ok(Json(serde_json::json!({
        "images": images,
        "storage_path": images_dir.to_string_lossy().to_string(),
    })))
}

async fn create_build(
    State(state): State<AppState>,
    Json(config): Json<ImageConfig>,
) -> Result<Json<BuildJob>, AppError> {
    let job_id = Uuid::new_v4().to_string();
    let job = BuildJob {
        id: job_id.clone(),
        status: JobStatus::Running,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    state.jobs.lock().await.push(job.clone());

    tokio::spawn(async move {
        if let Err(e) = run_build(job_id, config).await {
            error!("Build failed: {}", e);
        }
    });

    Ok(Json(job))
}

async fn flash_device(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<BuildJob>, AppError> {
    let job_id = Uuid::new_v4().to_string();
    let job = BuildJob {
        id: job_id.clone(),
        status: JobStatus::Running,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    state.jobs.lock().await.push(job.clone());

    let image_path = payload["image_path"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("Missing image_path".to_string()))?
        .to_string();
    let device = payload["device"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("Missing device".to_string()))?
        .to_string();

    tokio::spawn(async move {
        if let Err(e) = run_flash(job_id, image_path, device).await {
            error!("Flash failed: {}", e);
        }
    });

    Ok(Json(job))
}

async fn list_jobs(State(state): State<AppState>) -> Json<Vec<BuildJob>> {
    let jobs = state.jobs.lock().await;
    Json(jobs.clone())
}

async fn get_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<BuildJob>, AppError> {
    let jobs = state.jobs.lock().await;
    jobs.iter()
        .find(|j| j.id == id)
        .cloned()
        .map(Json)
        .ok_or_else(|| AppError::NotFound(format!("Job {} not found", id)))
}

async fn upload_file(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, AppError> {
    let mut file_path = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to read field: {}", e)))?
    {
        let name = field.file_name().map(|s| s.to_string());
        if let Some(filename) = name {
            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("Failed to read bytes: {}", e)))?;

            let dest = state.upload_dir.join(&filename);
            fs::write(&dest, data)
                .map_err(|e| AppError::Internal(format!("Failed to write file: {}", e)))?;

            file_path = Some(dest.to_string_lossy().to_string());
        }
    }

    file_path
        .map(|path| {
            Json(serde_json::json!({
                "path": path,
                "message": "File uploaded successfully"
            }))
        })
        .ok_or_else(|| AppError::BadRequest("No file provided".to_string()))
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(job_id): Path<String>,
) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, job_id))
}

async fn handle_socket(mut socket: WebSocket, job_id: String) {
    info!("WebSocket connected for job: {}", job_id);

    let log_file = format!("/tmp/imgforge-{}.log", job_id);

    if let Ok(file) = tokio::fs::File::open(&log_file).await {
        let reader = BufReader::new(file);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            if socket
                .send(Message::Text(line))
                .await
                .is_err()
            {
                break;
            }
        }
    }

    let _ = socket.send(Message::Close(None)).await;
}

async fn run_build(job_id: String, config: ImageConfig) -> Result<(), AppError> {
    info!("Starting build job: {}", job_id);

    let env_file = format!("/tmp/imgforge-{}.env", job_id);
    let log_file = format!("/tmp/imgforge-{}.log", job_id);

    let mut env_content = String::new();
    env_content.push_str(&format!("HOSTNAME={}\n", config.hostname));
    env_content.push_str(&format!(
        "CHANGE_USERNAME={}\n",
        if config.change_username { "y" } else { "n" }
    ));
    if let Some(username) = config.new_username {
        env_content.push_str(&format!("NEW_USERNAME={}\n", username));
    }
    env_content.push_str(&format!(
        "SET_ROOTPW={}\n",
        if config.set_root_password { "y" } else { "n" }
    ));
    if let Some(pw) = config.root_password {
        env_content.push_str(&format!("ROOTPW={}\n", pw));
    }
    env_content.push_str(&format!(
        "ENABLE_SSH={}\n",
        if config.enable_ssh { "y" } else { "n" }
    ));

    if let (Some(ssid), Some(pass)) = (config.wifi_ssid, config.wifi_password) {
        env_content.push_str("WIFI_CHOICE=1\n");
        env_content.push_str(&format!("WIFI_SSID={}\n", ssid));
        env_content.push_str(&format!("WIFI_PASS={}\n", pass));
    } else {
        env_content.push_str("WIFI_CHOICE=3\n");
    }

    env_content.push_str(&format!(
        "BOARD={}\n",
        match config.board_type {
            BoardType::RaspberryPi => "1",
            BoardType::Jetson => "2",
        }
    ));

    if let Some(preset) = config.preset_image {
        env_content.push_str("HAVE_IMG=n\n");
        env_content.push_str(&format!(
            "IMG_CHOICE={}\n",
            match preset {
                PresetImage::RaspberryPiLite => "1",
                PresetImage::RadxaDesktop => "2",
                PresetImage::RadxaServer => "3",
            }
        ));
    } else if let Some(url) = config.base_image_url {
        env_content.push_str("HAVE_IMG=y\n");
        env_content.push_str(&format!("BASE_IMG={}\n", url));
    }

    env_content.push_str(&format!(
        "EXPAND_IMG={}\n",
        if config.expand_image { "y" } else { "n" }
    ));
    if let Some(size) = config.extra_size {
        env_content.push_str(&format!("EXTRA_SIZE={}\n", size));
    }

    if let Some(compose) = config.docker_compose_content {
        let compose_path = format!("/tmp/imgforge-{}-compose.yml", job_id);
        fs::write(&compose_path, compose)
            .map_err(|e| AppError::Internal(format!("Failed to write compose file: {}", e)))?;
        env_content.push_str("HAVE_COMPOSE=y\n");
        env_content.push_str(&format!("COMPOSE_FILE={}\n", compose_path));
    } else {
        env_content.push_str("HAVE_COMPOSE=n\n");
    }

    if let Some(script) = config.custom_script_content {
        let script_path = format!("/tmp/imgforge-{}-script.sh", job_id);
        fs::write(&script_path, script)
            .map_err(|e| AppError::Internal(format!("Failed to write script: {}", e)))?;
        env_content.push_str("HAVE_SCRIPT=y\n");
        env_content.push_str("SCRIPT_TYPE=1\n");
        env_content.push_str(&format!("CUSTOM_SCRIPT={}\n", script_path));
    } else if let Some(cmd) = config.inline_command {
        env_content.push_str("HAVE_SCRIPT=y\n");
        env_content.push_str("SCRIPT_TYPE=2\n");
        env_content.push_str(&format!("INLINE_COMMAND={}\n", cmd));
    } else {
        env_content.push_str("HAVE_SCRIPT=n\n");
    }

    env_content.push_str("SKIP_WIZARD=y\n");

    fs::write(&env_file, &env_content)
        .map_err(|e| AppError::Internal(format!("Failed to write env file: {}", e)))?;

    // Save config to ~/.imgforge/configs
    let imgforge_home = std::env::var("IMGFORGE_HOME")
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").expect("HOME environment variable not set");
            format!("{}/.imgforge", home)
        });
    let config_path = PathBuf::from(&imgforge_home).join("configs").join(format!("{}.env", job_id));
    fs::write(&config_path, &env_content)
        .map_err(|e| AppError::Internal(format!("Failed to write config: {}", e)))?;

    fs::write(&format!("/workdir/last-run.env"), &env_content)
        .map_err(|e| AppError::Internal(format!("Failed to write last-run.env: {}", e)))?;

    let mut child = Command::new("/workdir/imgforge.sh")
        .current_dir("/workdir")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("MODE", match config.mode {
            BuildMode::Flash => "1",
            BuildMode::Artifact => "2",
        })
        .spawn()
        .map_err(|e| AppError::Internal(format!("Failed to spawn imgforge.sh: {}", e)))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let log_file_clone = log_file.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        let mut log = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file_clone)
            .await
            .unwrap();

        while reader.read_line(&mut line).await.unwrap() > 0 {
            use tokio::io::AsyncWriteExt;
            let _ = log.write_all(line.as_bytes()).await;
            info!("[BUILD] {}", line.trim());
            line.clear();
        }
    });

    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        while reader.read_line(&mut line).await.unwrap() > 0 {
            error!("[BUILD] {}", line.trim());
            line.clear();
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to wait for process: {}", e)))?;

    if status.success() {
        info!("Build job {} completed successfully", job_id);

        // Move output image to ~/.imgforge/images if build was successful
        if let BuildMode::Artifact = config.mode {
            let imgforge_home = std::env::var("IMGFORGE_HOME")
                .unwrap_or_else(|_| {
                    let home = std::env::var("HOME").expect("HOME environment variable not set");
                    format!("{}/.imgforge", home)
                });

            let source = PathBuf::from("/workdir/custom.img");
            if source.exists() {
                let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
                let dest_name = format!("{}_{}.img", config.hostname, timestamp);
                let dest = PathBuf::from(&imgforge_home).join("images").join(&dest_name);

                if let Err(e) = fs::copy(&source, &dest) {
                    error!("Failed to copy image to storage: {}", e);
                } else {
                    info!("Saved image to: {}", dest.display());
                }
            }
        }
    } else {
        error!("Build job {} failed with status: {}", job_id, status);
    }

    Ok(())
}

async fn run_flash(job_id: String, image_path: String, device: String) -> Result<(), AppError> {
    info!("Starting flash job: {} to {}", image_path, device);

    let log_file = format!("/tmp/imgforge-{}.log", job_id);

    let mut child = Command::new("dd")
        .args([
            &format!("if={}", image_path),
            &format!("of={}", device),
            "bs=4M",
            "status=progress",
            "conv=fsync",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Internal(format!("Failed to spawn dd: {}", e)))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let log_file_clone = log_file.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        let mut log = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file_clone)
            .await
            .unwrap();

        while reader.read_line(&mut line).await.unwrap() > 0 {
            use tokio::io::AsyncWriteExt;
            let _ = log.write_all(line.as_bytes()).await;
            info!("[FLASH] {}", line.trim());
            line.clear();
        }
    });

    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        while reader.read_line(&mut line).await.unwrap() > 0 {
            info!("[FLASH] {}", line.trim());
            line.clear();
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to wait for dd: {}", e)))?;

    if status.success() {
        info!("Flash job {} completed successfully", job_id);
    } else {
        error!("Flash job {} failed with status: {}", job_id, status);
    }

    Ok(())
}

#[derive(Debug)]
enum AppError {
    NotFound(String),
    BadRequest(String),
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };

        let body = Json(serde_json::json!({
            "error": error_message
        }));

        (status, body).into_response()
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::NotFound(msg) => write!(f, "Not found: {}", msg),
            AppError::BadRequest(msg) => write!(f, "Bad request: {}", msg),
            AppError::Internal(msg) => write!(f, "Internal error: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}
