// Offline speech-to-text (whisper.cpp via whisper-rs).
//
// Everything runs locally — no network at recognition time, in keeping with the
// app's local-first ethos. Models are downloaded once (from the public
// ggerganov/whisper.cpp HuggingFace repo) into the app data dir and managed by
// the user from Settings → Speech.
//
// Audio pipeline: a single worker thread builds a cpal input stream (whose
// callback runs on cpal's own audio thread and pushes mono samples into a
// lock-free ring buffer), then loops reading the ring, resampling to 16 kHz,
// running energy-based voice-activity detection, and feeding finalized speech
// segments to whisper. Recognized text is emitted to the frontend as it lands.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use futures_util::StreamExt;
use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::HeapRb;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

// ---- Model catalog --------------------------------------------------------

struct CatalogEntry {
    id: &'static str,
    label: &'static str,
    size_bytes: u64,
    lang: &'static str,
    /// HuggingFace file name under ggerganov/whisper.cpp/resolve/main/.
    file: &'static str,
}

// Sizes are the approximate on-disk size of the ggml f16 model files.
const CATALOG: &[CatalogEntry] = &[
    CatalogEntry { id: "tiny.en",   label: "Tiny (English)",   size_bytes: 77_700_000,    lang: "en",    file: "ggml-tiny.en.bin" },
    CatalogEntry { id: "base.en",   label: "Base (English)",   size_bytes: 147_900_000,   lang: "en",    file: "ggml-base.en.bin" },
    CatalogEntry { id: "small.en",  label: "Small (English)",  size_bytes: 487_600_000,   lang: "en",    file: "ggml-small.en.bin" },
    CatalogEntry { id: "small",     label: "Small (Multilingual)", size_bytes: 487_600_000, lang: "multi", file: "ggml-small.bin" },
    CatalogEntry { id: "medium.en", label: "Medium (English)", size_bytes: 1_533_800_000, lang: "en",    file: "ggml-medium.en.bin" },
];

const HF_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

fn catalog_entry(id: &str) -> Option<&'static CatalogEntry> {
    CATALOG.iter().find(|e| e.id == id)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    id: String,
    label: String,
    size_bytes: u64,
    downloaded: bool,
    lang: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SttStatus {
    running: bool,
    model_id: Option<String>,
}

// ---- Managed session state ------------------------------------------------

struct Session {
    model_id: String,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

#[derive(Default)]
pub struct SttManager {
    inner: Mutex<Option<Session>>,
}

// ---- Paths ----------------------------------------------------------------

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join("models");
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create models dir: {e}"))?;
    Ok(dir)
}

fn model_path(app: &AppHandle, entry: &CatalogEntry) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(entry.file))
}

// ---- Commands -------------------------------------------------------------

#[tauri::command]
pub fn stt_list_models(app: AppHandle) -> Result<Vec<ModelInfo>, String> {
    let dir = models_dir(&app)?;
    Ok(CATALOG
        .iter()
        .map(|e| ModelInfo {
            id: e.id.to_string(),
            label: e.label.to_string(),
            size_bytes: e.size_bytes,
            downloaded: dir.join(e.file).exists(),
            lang: e.lang.to_string(),
        })
        .collect())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SttCapabilities {
    /// True if this build was compiled with a GPU backend (Vulkan). Cheap,
    /// compile-time only — does NOT initialize Vulkan or probe the GPU.
    gpu_build: bool,
}

#[tauri::command]
pub fn stt_capabilities() -> SttCapabilities {
    SttCapabilities { gpu_build: cfg!(feature = "gpu") }
}

#[tauri::command]
pub fn stt_status(state: State<'_, SttManager>) -> SttStatus {
    let guard = state.inner.lock().unwrap();
    match guard.as_ref() {
        Some(s) => SttStatus { running: true, model_id: Some(s.model_id.clone()) },
        None => SttStatus { running: false, model_id: None },
    }
}

#[tauri::command]
pub async fn stt_download_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let entry = catalog_entry(&model_id).ok_or_else(|| format!("unknown model: {model_id}"))?;
    let dest = model_path(&app, entry)?;
    if dest.exists() {
        return Ok(());
    }
    let partial = dest.with_extension("partial");
    let url = format!("{HF_BASE}/{}", entry.file);

    let resp = reqwest::get(&url).await.map_err(|e| format!("download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);

    let mut file = fs::File::create(&partial).map_err(|e| format!("cannot write model: {e}"))?;
    let mut received: u64 = 0;
    let mut stream = resp.bytes_stream();
    let mut last_emit: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                let _ = fs::remove_file(&partial);
                let _ = app.emit("stt://download-error", DownloadError { model_id: model_id.clone(), message: e.to_string() });
                return Err(format!("download interrupted: {e}"));
            }
        };
        if let Err(e) = file.write_all(&chunk) {
            let _ = fs::remove_file(&partial);
            return Err(format!("cannot write model: {e}"));
        }
        received += chunk.len() as u64;
        // Throttle progress events to ~every 1 MB so we don't flood the bridge.
        if received - last_emit >= 1_000_000 {
            last_emit = received;
            let _ = app.emit("stt://download-progress", DownloadProgress { model_id: model_id.clone(), received, total });
        }
    }
    drop(file);
    fs::rename(&partial, &dest).map_err(|e| format!("cannot finalize model: {e}"))?;
    let _ = app.emit("stt://download-progress", DownloadProgress { model_id: model_id.clone(), received, total: received });
    let _ = app.emit("stt://download-done", DownloadDone { model_id });
    Ok(())
}

#[tauri::command]
pub fn stt_delete_model(app: AppHandle, model_id: String, state: State<'_, SttManager>) -> Result<(), String> {
    if let Some(s) = state.inner.lock().unwrap().as_ref() {
        if s.model_id == model_id {
            return Err("Stop dictation before deleting the model in use.".into());
        }
    }
    let entry = catalog_entry(&model_id).ok_or_else(|| format!("unknown model: {model_id}"))?;
    let path = model_path(&app, entry)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("cannot delete model: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn stt_start(app: AppHandle, model_id: String, state: State<'_, SttManager>) -> Result<(), String> {
    let mut guard = state.inner.lock().unwrap();
    if guard.is_some() {
        return Err("already listening".into());
    }
    let entry = catalog_entry(&model_id).ok_or_else(|| format!("unknown model: {model_id}"))?;
    let path = model_path(&app, entry)?;
    if !path.exists() {
        return Err("model is not downloaded".into());
    }
    let lang = entry.lang;
    let stop = Arc::new(AtomicBool::new(false));

    let app_t = app.clone();
    let stop_t = stop.clone();
    let path_str = path.to_string_lossy().to_string();
    let model_for_thread = model_id.clone();

    let worker = std::thread::Builder::new()
        .name("stt-worker".into())
        .spawn(move || {
            // A panic in the worker must not leave the UI stuck "listening".
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run_session(&app_t, &path_str, lang, &stop_t);
            }));
            if let Err(_) = result {
                let _ = app_t.emit("stt://state", StateEvent { state: "error".into(), model_id: Some(model_for_thread.clone()), message: Some("speech engine crashed".into()) });
            }
            let _ = app_t.emit("stt://state", StateEvent { state: "stopped".into(), model_id: None, message: None });
        })
        .map_err(|e| format!("cannot start worker: {e}"))?;

    *guard = Some(Session { model_id, stop, worker: Some(worker) });
    Ok(())
}

#[tauri::command]
pub fn stt_stop(state: State<'_, SttManager>) -> Result<(), String> {
    // Take the session out under the lock, then join OUTSIDE the lock so we
    // never hold the mutex while waiting on the worker (deadlock-free, idempotent).
    let session = state.inner.lock().unwrap().take();
    if let Some(mut s) = session {
        s.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = s.worker.take() {
            let _ = handle.join();
        }
    }
    Ok(())
}

// ---- Event payloads -------------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress { model_id: String, received: u64, total: u64 }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadDone { model_id: String }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadError { model_id: String, message: String }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StateEvent { state: String, model_id: Option<String>, message: Option<String> }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Transcript { text: String, segment_index: i32 }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Partial { text: String }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BackendInfo { gpu: bool, device: Option<String> }

// ---- Audio + recognition --------------------------------------------------

const TARGET_RATE: u32 = 16_000;
const FRAME: usize = 480; // 30 ms @ 16 kHz
/// Trailing silence that ends an utterance. Long enough that natural pauses
/// between words/clauses don't chop a sentence into pieces — only a real stop
/// commits. Interim results keep the text live during the wait, so this longer
/// window costs no perceived latency.
const SILENCE_MS: usize = 1000;
/// Hard cap on a single utterance before forcing a commit (very long monologues).
const MAX_SEGMENT_MS: usize = 30_000;
const MIN_SEGMENT_MS: usize = 200;
/// How often (wall-clock) to re-transcribe the in-progress utterance for live
/// interim results. Small = words appear quickly (near word-by-word); inference
/// runs at most once per this window. Fine for GPU / small models.
const PARTIAL_STEP_MS: u64 = 300;
/// Minimum audio collected before the first interim result (shorter clips make
/// Whisper hallucinate).
const MIN_PARTIAL_MS: usize = 320;

fn ms_to_samples(ms: usize) -> usize {
    TARGET_RATE as usize * ms / 1000
}

/// Owns the cpal stream + the whisper context for the lifetime of one dictation
/// session. Returns when `stop` flips true (or on a fatal audio/model error).
fn run_session(app: &AppHandle, model_path: &str, lang: &'static str, stop: &Arc<AtomicBool>) {
    let _ = app.emit("stt://state", StateEvent { state: "starting".into(), model_id: None, message: None });

    // --- load the model once for the whole session ---
    // Prefer the GPU (Vulkan) when this build has it; gracefully fall back to CPU
    // so the same binary runs on machines without a usable GPU.
    let (ctx, gpu_name) = match load_context(model_path) {
        Ok(v) => v,
        Err(e) => {
            let _ = app.emit("stt://state", StateEvent { state: "error".into(), model_id: None, message: Some(format!("failed to load model: {e}")) });
            return;
        }
    };
    let _ = app.emit("stt://backend", BackendInfo { gpu: gpu_name.is_some(), device: gpu_name });
    let mut wstate = match ctx.create_state() {
        Ok(s) => s,
        Err(e) => {
            let _ = app.emit("stt://state", StateEvent { state: "error".into(), model_id: None, message: Some(format!("failed to init engine: {e}")) });
            return;
        }
    };

    // --- open the system default input device ---
    let host = cpal::default_host();
    let device = match host.default_input_device() {
        Some(d) => d,
        None => {
            let _ = app.emit("stt://state", StateEvent { state: "error".into(), model_id: None, message: Some("no microphone found".into()) });
            return;
        }
    };
    let supported = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit("stt://state", StateEvent { state: "error".into(), model_id: None, message: Some(format!("no input config: {e}")) });
            return;
        }
    };
    let in_rate = supported.sample_rate().0;
    let channels = supported.channels() as usize;
    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();

    // Ring buffer holds mono samples at the device rate. ~30 s headroom so
    // inference can run for seconds without dropping captured audio.
    let capacity = (in_rate as usize) * 30;
    let rb = HeapRb::<f32>::new(capacity);
    let (mut producer, mut consumer) = rb.split();

    let err_fn = |e| eprintln!("[stt] audio stream error: {e}");

    // Callback: downmix interleaved frames to mono, push to the ring. Keep it
    // allocation-free and inference-free — heavy work here can stall capture.
    let build = || -> Result<cpal::Stream, cpal::BuildStreamError> {
        macro_rules! input_stream {
            ($ty:ty, $to_f32:expr) => {{
                let ch = channels;
                device.build_input_stream(
                    &config,
                    move |data: &[$ty], _: &cpal::InputCallbackInfo| {
                        if ch <= 1 {
                            for &s in data {
                                let _ = producer.try_push($to_f32(s));
                            }
                        } else {
                            for frame in data.chunks(ch) {
                                let mut acc = 0.0f32;
                                for &s in frame {
                                    acc += $to_f32(s);
                                }
                                let _ = producer.try_push(acc / ch as f32);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }};
        }
        match sample_format {
            cpal::SampleFormat::F32 => input_stream!(f32, |s: f32| s),
            cpal::SampleFormat::I16 => input_stream!(i16, |s: i16| s as f32 / i16::MAX as f32),
            cpal::SampleFormat::U16 => input_stream!(u16, |s: u16| (s as f32 / u16::MAX as f32) * 2.0 - 1.0),
            other => {
                eprintln!("[stt] unsupported sample format: {other:?}");
                // Fall back to F32 attempt; will error out below if wrong.
                input_stream!(f32, |s: f32| s)
            }
        }
    };

    let stream = match build() {
        Ok(s) => s,
        Err(e) => {
            let _ = app.emit("stt://state", StateEvent { state: "error".into(), model_id: None, message: Some(format!("cannot open microphone: {e}")) });
            return;
        }
    };
    if let Err(e) = stream.play() {
        let _ = app.emit("stt://state", StateEvent { state: "error".into(), model_id: None, message: Some(format!("cannot start microphone: {e}")) });
        return;
    }

    let _ = app.emit("stt://state", StateEvent { state: "listening".into(), model_id: None, message: None });

    let n_threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(8) as i32;

    // VAD / segmentation state (all at 16 kHz mono).
    let mut resampled: Vec<f32> = Vec::new(); // pending 16 kHz samples not yet framed
    let mut segment: Vec<f32> = Vec::new(); // current utterance being collected
    let mut triggered = false;
    let mut silence_run = 0usize;
    let mut noise_floor = 0.0008f32;
    let mut seg_index = 0i32;
    let mut scratch = vec![0.0f32; 4096];
    // Throttles interim re-transcription so inference runs at most ~once per step.
    let mut last_partial = Instant::now();

    let silence_limit = ms_to_samples(SILENCE_MS);
    let max_seg = ms_to_samples(MAX_SEGMENT_MS);
    let min_seg = ms_to_samples(MIN_SEGMENT_MS);
    let min_partial = ms_to_samples(MIN_PARTIAL_MS);
    let step = Duration::from_millis(PARTIAL_STEP_MS);
    // Minimum wait before the next interim pass. Starts at `step` but grows to
    // match how long the last pass took, so a long sentence (whose whole segment
    // is re-transcribed each time) gets fewer live updates instead of pinning
    // the CPU. The final pass still transcribes the complete segment.
    let mut partial_gap = step;

    while !stop.load(Ordering::SeqCst) {
        let n = consumer.pop_slice(&mut scratch);
        if n == 0 {
            std::thread::sleep(Duration::from_millis(15));
            continue;
        }
        // Resample this chunk (device rate mono -> 16 kHz mono) and queue it.
        resample_into(&scratch[..n], in_rate, TARGET_RATE, &mut resampled);

        // Process complete 30 ms frames out of the pending buffer.
        let mut consumed = 0usize;
        while resampled.len() - consumed >= FRAME {
            let frame = &resampled[consumed..consumed + FRAME];
            consumed += FRAME;

            let rms = frame_rms(frame);
            let voiced = rms > (noise_floor * 3.0).max(0.01);
            if !voiced {
                // Slowly adapt the noise floor toward ambient level.
                noise_floor = noise_floor * 0.95 + rms * 0.05;
            }

            if voiced {
                triggered = true;
                silence_run = 0;
                segment.extend_from_slice(frame);
            } else if triggered {
                // Keep a little trailing silence so word endings aren't clipped.
                segment.extend_from_slice(frame);
                silence_run += FRAME;
            }

            let end_of_utterance = triggered && silence_run >= silence_limit;
            let too_long = triggered && segment.len() >= max_seg;
            if end_of_utterance || too_long {
                if segment.len() >= min_seg {
                    let text = run_inference(&mut wstate, &segment, lang, n_threads);
                    if !text.is_empty() {
                        let _ = app.emit("stt://transcript", Transcript { text, segment_index: seg_index });
                        seg_index += 1;
                    }
                }
                segment.clear();
                triggered = false;
                silence_run = 0;
                last_partial = Instant::now();
            }
        }
        if consumed > 0 {
            resampled.drain(..consumed);
        }

        // Live interim result: re-transcribe the utterance-so-far on a cadence,
        // so words appear as they're spoken instead of only at the sentence end.
        if triggered && segment.len() >= min_partial && last_partial.elapsed() >= partial_gap {
            let t0 = Instant::now();
            let text = run_inference(&mut wstate, &segment, lang, n_threads);
            // Space the next interim by at least this pass's own cost (floored at
            // `step`), so long sentences back off automatically and never starve
            // audio capture.
            partial_gap = step.max(t0.elapsed());
            if !text.is_empty() {
                let _ = app.emit("stt://partial", Partial { text });
            }
            last_partial = Instant::now();
        }
    }

    // On stop, an utterance may still be in progress. The OS/cpal capture buffer
    // can still hold the last fraction of a second of speech that hasn't reached
    // our ring buffer yet, so a single instant drain clips the final word(s).
    // Instead, keep draining across a short grace window: pull everything that's
    // there, and during quiet wait out the window so stragglers still arrive.
    // The stream is still playing here (dropped below). Only do this when an
    // utterance is actually open (`triggered`) — stopping during silence has
    // nothing pending to flush and would only feed Whisper noise.
    if triggered {
        let grace = Instant::now() + Duration::from_millis(300);
        loop {
            let n = consumer.pop_slice(&mut scratch);
            if n > 0 {
                resample_into(&scratch[..n], in_rate, TARGET_RATE, &mut resampled);
                continue; // keep draining while audio is still flowing in
            }
            if Instant::now() >= grace {
                break;
            }
            std::thread::sleep(Duration::from_millis(15));
        }
        if !resampled.is_empty() {
            segment.extend_from_slice(&resampled);
            resampled.clear();
        }

        // Flush whatever was mid-sentence when the user stopped — finalize it so
        // no spoken words are dropped on stop.
        if segment.len() >= ms_to_samples(150) {
            let text = run_inference(&mut wstate, &segment, lang, n_threads);
            if !text.is_empty() {
                let _ = app.emit("stt://transcript", Transcript { text, segment_index: seg_index });
            }
        }
    }

    drop(stream); // stop + release the device on this thread (Stream is !Send)
}

/// Load the model, preferring the GPU and falling back to CPU. Returns the GPU
/// device name when a GPU is used (None = CPU). In a CPU-only build (`use_gpu`
/// defaults to false) this just loads on CPU; in a GPU build it pins whisper to
/// the best real GPU and retries on CPU if that fails — so one binary runs
/// everywhere.
fn load_context(path: &str) -> Result<(WhisperContext, Option<String>), whisper_rs::WhisperError> {
    let params = WhisperContextParameters::default();
    if params.use_gpu {
        // On NVIDIA Optimus / PRIME hybrid laptops the discrete GPU is hidden from
        // Vulkan entirely unless render-offload is requested — so an app only sees
        // the integrated GPU. Enabling offload exposes the dGPU; NVIDIA_only makes
        // the NVIDIA implicit layer present the discrete GPU to Vulkan. Both are
        // no-ops on machines without the NVIDIA layer, so the build stays portable.
        // (Only set if the user hasn't overridden them.)
        #[cfg(target_os = "linux")]
        {
            if std::env::var_os("__NV_PRIME_RENDER_OFFLOAD").is_none() {
                std::env::set_var("__NV_PRIME_RENDER_OFFLOAD", "1");
            }
            if std::env::var_os("__VK_LAYER_NV_optimus").is_none() {
                std::env::set_var("__VK_LAYER_NV_optimus", "NVIDIA_only");
            }
        }
        // Without this, whisper.cpp uses Vulkan "device 0", which on hybrid
        // laptops is often the integrated GPU (so a discrete NVIDIA stays idle).
        // Pin it to the best real GPU, and never the CPU/lavapipe software driver.
        if let Some((idx, name)) = pick_gpu() {
            std::env::set_var("GGML_VK_VISIBLE_DEVICES", idx.to_string());
            match WhisperContext::new_with_params(path, WhisperContextParameters::default()) {
                Ok(ctx) => return Ok((ctx, Some(name))),
                Err(e) => eprintln!("[stt] GPU init failed on {name} ({e}); falling back to CPU"),
            }
        } else {
            eprintln!("[stt] no suitable GPU found; using CPU");
        }
    }
    let mut cpu = WhisperContextParameters::default();
    cpu.use_gpu(false);
    Ok((WhisperContext::new_with_params(path, cpu)?, None))
}

/// Enumerate Vulkan GPUs and return the (enumeration index, name) of the best
/// one: discrete preferred over integrated, never a CPU/software (lavapipe)
/// device. The index matches whisper.cpp's own `vkEnumeratePhysicalDevices`
/// order, so it's valid for `GGML_VK_VISIBLE_DEVICES`. None = no real GPU.
fn pick_gpu() -> Option<(usize, String)> {
    use std::ffi::CStr;
    unsafe {
        let entry = ash::Entry::load().ok()?;
        let app_info = ash::vk::ApplicationInfo {
            api_version: ash::vk::make_api_version(0, 1, 0, 0),
            ..Default::default()
        };
        let create_info = ash::vk::InstanceCreateInfo {
            p_application_info: &app_info,
            ..Default::default()
        };
        let instance = entry.create_instance(&create_info, None).ok()?;

        let mut best: Option<(usize, String, i32)> = None;
        if let Ok(devices) = instance.enumerate_physical_devices() {
            for (i, &pd) in devices.iter().enumerate() {
                let props = instance.get_physical_device_properties(pd);
                let rank = match props.device_type {
                    ash::vk::PhysicalDeviceType::DISCRETE_GPU => 3,
                    ash::vk::PhysicalDeviceType::INTEGRATED_GPU => 2,
                    ash::vk::PhysicalDeviceType::VIRTUAL_GPU => 1,
                    _ => 0, // OTHER / CPU (lavapipe) — skip
                };
                if rank > 0 && best.as_ref().map_or(true, |(_, _, r)| rank > *r) {
                    let name = CStr::from_ptr(props.device_name.as_ptr()).to_string_lossy().into_owned();
                    best = Some((i, name, rank));
                }
            }
        }
        instance.destroy_instance(None);
        best.map(|(i, name, _)| (i, name))
    }
}

/// Run whisper on a buffer of 16 kHz mono samples and return the cleaned text.
/// Shared by both interim (partial) and finalized (transcript) recognition.
fn run_inference(
    wstate: &mut whisper_rs::WhisperState,
    samples: &[f32],
    lang: &'static str,
    n_threads: i32,
) -> String {
    // Isolate the whisper call: a bad/oversized clip can make it panic, and a
    // panic here would otherwise unwind the whole worker thread and end the
    // dictation session (what made long sentences "unexpectedly stop" partway,
    // dropping everything after). Catch it so one failed pass just yields no
    // text and the session keeps listening.
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(n_threads);
        if lang == "en" {
            params.set_language(Some("en"));
        }
        params.set_translate(false);
        params.set_no_context(true);
        params.set_single_segment(false);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);

        if let Err(e) = wstate.full(params, samples) {
            eprintln!("[stt] inference failed: {e}");
            return String::new();
        }

        let mut out = String::new();
        for segment in wstate.as_iter() {
            if let Ok(text) = segment.to_str_lossy() {
                out.push_str(&text);
            }
        }
        clean_transcript(&out)
    }));
    outcome.unwrap_or_else(|_| {
        eprintln!("[stt] inference panicked; skipping this pass (session stays live)");
        String::new()
    })
}

/// whisper emits leading spaces and bracketed non-speech tokens like [BLANK_AUDIO].
fn clean_transcript(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    // Drop pure non-speech annotations (whole string wrapped in [] or ()).
    let is_annotation = (trimmed.starts_with('[') && trimmed.ends_with(']'))
        || (trimmed.starts_with('(') && trimmed.ends_with(')'));
    if is_annotation {
        return String::new();
    }
    trimmed.to_string()
}

fn frame_rms(frame: &[f32]) -> f32 {
    if frame.is_empty() {
        return 0.0;
    }
    let sum: f32 = frame.iter().map(|s| s * s).sum();
    (sum / frame.len() as f32).sqrt()
}

/// Linear-interpolating resampler. Stateless per call — chunk-boundary error is
/// negligible for speech. Appends the resampled output to `out`.
fn resample_into(input: &[f32], from: u32, to: u32, out: &mut Vec<f32>) {
    if input.is_empty() {
        return;
    }
    if from == to {
        out.extend_from_slice(input);
        return;
    }
    let ratio = from as f64 / to as f64;
    let out_len = ((input.len() as f64) / ratio).floor() as usize;
    out.reserve(out_len);
    for i in 0..out_len {
        let src = i as f64 * ratio;
        let idx = src.floor() as usize;
        let frac = (src - idx as f64) as f32;
        let a = input[idx];
        let b = if idx + 1 < input.len() { input[idx + 1] } else { a };
        out.push(a + (b - a) * frac);
    }
}
