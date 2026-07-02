import { useRef, useState } from "react";
import { streamSSE } from "../api";
import { useEntitlements } from "../entitlements";
import { Markdown } from "../components/Markdown";
import { RateBar } from "../components/RateBar";
import { useGamify } from "../components/Gamify";

interface Frame {
  t: number;
  image: string;
}

const FRAME_COUNT = 8;
const MAX_DIM = 960;

// The Film Room: upload a clip (Veo/Trace export or phone video), the browser
// extracts keyframes locally, and the vision model reads the sequence like film.
export function FilmRoom() {
  const { celebrate } = useGamify();
  const ent = useEntitlements();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [context, setContext] = useState("");
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    setFrames([]);
    setAnswer("");
    if (file.size > 200 * 1024 * 1024) {
      setError("Keep clips under 200MB — trim to the moment you care about (10-60 seconds is ideal).");
      return;
    }
    setVideoUrl(URL.createObjectURL(file));
  }

  // Extract N evenly-spaced frames in-browser: zero upload of the video itself.
  async function extract() {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    setExtracting(true);
    setError("");
    try {
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 1) resolve();
        else {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error("Couldn't read this video format"));
        }
      });
      const duration = video.duration;
      if (!isFinite(duration) || duration <= 0) throw new Error("Couldn't read the clip length");

      const canvas = document.createElement("canvas");
      const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d")!;

      const out: Frame[] = [];
      for (let i = 0; i < FRAME_COUNT; i++) {
        const t = (duration * (i + 0.5)) / FRAME_COUNT;
        await new Promise<void>((resolve, reject) => {
          const onSeek = () => {
            video.removeEventListener("seeked", onSeek);
            resolve();
          };
          video.addEventListener("seeked", onSeek);
          video.onerror = () => reject(new Error("Seek failed"));
          video.currentTime = t;
        });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        out.push({ t, image: canvas.toDataURL("image/jpeg", 0.72) });
        setFrames([...out]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Frame extraction failed — try a standard MP4");
    }
    setExtracting(false);
  }

  async function analyze() {
    if (frames.length === 0 || streaming) return;
    setError("");
    setAnswer("");
    setStreaming(true);
    let acc = "";
    await streamSSE(
      "/api/film-analysis",
      { frames, context },
      {
        onDelta: (t) => {
          acc += t;
          setAnswer(acc);
        },
        onDone: (extra) => {
          setStreaming(false);
          celebrate(extra.award);
        },
        onError: (m) => {
          setStreaming(false);
          setError(m);
        },
      },
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0 }}>🎞️ Break down your game film</h3>
          {ent && ent.filmClipsLeft !== null && (
            <span className="chip" style={{ color: ent.filmClipsLeft === 0 ? "var(--red)" : "var(--gold)" }}>
              {ent.filmClipsLeft} free clip{ent.filmClipsLeft === 1 ? "" : "s"} left this month · Pro is unlimited
            </span>
          )}
        </div>
        <p className="muted small">
          Upload a clip — a Veo/Trace highlight export or a phone video (10-60 seconds works best). TactIQ extracts keyframes
          <b> in your browser</b> (the video never uploads) and your AI analyst reads the sequence like film: shape, spacing,
          the moment it went wrong, and how to train the fix.
        </p>
        <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>🎬 Choose clip</button>
          {videoUrl && (
            <button className="btn ghost" onClick={() => void extract()} disabled={extracting}>
              {extracting ? `Extracting… ${frames.length}/${FRAME_COUNT}` : "🖼️ Extract keyframes"}
            </button>
          )}
        </div>

        {videoUrl && <video ref={videoRef} src={videoUrl} className="video-preview" controls muted playsInline preload="metadata" />}

        {frames.length > 0 && (
          <>
            <div className="frame-strip">
              {frames.map((f, i) => (
                <div key={i}>
                  <img src={f.image} alt={`frame ${i}`} />
                  <div className="ts">{f.t.toFixed(1)}s</div>
                </div>
              ))}
            </div>
            <label className="field" style={{ margin: "10px 0 14px" }}>
              What should the analyst focus on? (optional)
              <input
                value={context}
                placeholder="e.g. We're in orange. How did they play through our press here?"
                onChange={(e) => setContext(e.target.value)}
              />
            </label>
            <button className="btn" onClick={() => void analyze()} disabled={streaming}>
              {streaming ? "Analyzing the film…" : "⚡ Analyze Clip"}
            </button>
          </>
        )}
        {error && <div className="error-box">{error}</div>}
      </div>

      {(answer || streaming) && (
        <div className="card fade-in">
          {answer ? (
            <>
              <Markdown text={answer} />
              {!streaming && <RateBar kind="film" />}
            </>
          ) : (
            <span className="typing"><span /><span /><span /></span>
          )}
        </div>
      )}
    </div>
  );
}
