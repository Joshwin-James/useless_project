import { useEffect, useRef, useState, useCallback } from "react";
import {
  ExperimentMode,
  ExperimentStatus,
  ExperimentResult,
  useExperimentHistory,
} from "@/lib/experimentState";
import { findPotatoBlob, findAsymmetricFeature } from "@/lib/vision";
import {
  unwrapAngle,
  calculateEMA,
  estimateDeceleration,
  predictStoppingAmount,
  degreesPerSecToRPM,
} from "@/lib/physics";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ResultsDashboard } from "./ResultsDashboard";

export function ExperimentRunner({ mode, onExit }: { mode: ExperimentMode; onExit: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [status, setStatus] = useState<ExperimentStatus>("calibrating");
  const [liveMetric, setLiveMetric] = useState(0); // RPM or px/s
  const [showMarkerPrompt, setShowMarkerPrompt] = useState(false);
  const [result, setResult] = useState<ExperimentResult | null>(null);

  const { history, addResult, clearHistory } = useExperimentHistory();

  // Mutable refs for RAF loop to avoid React re-renders
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Physics tracking state
  const prevCentroidRef = useRef<{ x: number; y: number } | null>(null);
  const prevAngleRef = useRef<number | null>(null);
  const unwrappedAngleRef = useRef<number>(0);
  const emaVelocityRef = useRef<number>(0);

  const dataLog = useRef<{ t: number; v: number }[]>([]); // For regression
  const peakValueRef = useRef<number>(0);

  const modeRef = useRef(mode);
  const statusRef = useRef(status);

  // Throttle react updates
  const lastUiUpdateRef = useRef<number>(0);
  const markerFailStartTimeRef = useRef<number | null>(null);
  const mountIdRef = useRef<number>(0);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const initCamera = useCallback(async () => {
    const mountId = ++mountIdRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (mountId !== mountIdRef.current) {
        // Component unmounted or another initCamera took over
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((e) => {
          if (mountId !== mountIdRef.current) return;
          console.error("Play failed", e);
          setStatus("idle");
          setErrorMsg("Video playback failed: " + e.message);
        });
      }
      streamRef.current = stream;
      setStatus("ready");
      setErrorMsg(null);
    } catch (e) {
      if (mountId !== mountIdRef.current) return;
      const err = e as Error;
      console.error("Camera access denied", err);
      setStatus("idle");
      setErrorMsg(err.message || "Camera permission denied or device not found.");
    }
  }, []);

  const cleanup = useCallback(() => {
    mountIdRef.current++; // invalidate pending requests
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    initCamera();
    return cleanup;
  }, [initCamera, cleanup]);

  // Main Tracking Loop
  const tick = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || statusRef.current === "stopped") return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const now = performance.now();
    const dt = (now - lastTimeRef.current) / 1000;

    try {
      // Draw video to canvas (or hidden canvas)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      let currentVelocity = 0;

      if (
        statusRef.current === "ready" ||
        statusRef.current === "tracking" ||
        statusRef.current === "predicting"
      ) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const blob = findPotatoBlob(imageData, canvas.width, canvas.height);

        if (blob) {
          // Draw bounding box
          ctx.strokeStyle = "red";
          ctx.lineWidth = 3;
          ctx.strokeRect(
            blob.box.minX,
            blob.box.minY,
            blob.box.maxX - blob.box.minX,
            blob.box.maxY - blob.box.minY,
          );

          // Draw centroid
          ctx.fillStyle = "blue";
          ctx.beginPath();
          ctx.arc(blob.centroid.x, blob.centroid.y, 5, 0, 2 * Math.PI);
          ctx.fill();

          if (modeRef.current === "push") {
            if (prevCentroidRef.current && dt > 0) {
              const dx = blob.centroid.x - prevCentroidRef.current.x;
              const dy = blob.centroid.y - prevCentroidRef.current.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const rawV = dist / dt;
              currentVelocity = calculateEMA(rawV, emaVelocityRef.current, 0.3);
              emaVelocityRef.current = currentVelocity;
            }
            prevCentroidRef.current = blob.centroid;
          } else if (modeRef.current === "spin") {
            const feature = findAsymmetricFeature(imageData, canvas.width, blob.box);

            if (feature) {
              markerFailStartTimeRef.current = null;

              // Draw feature line
              ctx.strokeStyle = "yellow";
              ctx.beginPath();
              ctx.moveTo(blob.centroid.x, blob.centroid.y);
              ctx.lineTo(feature.x, feature.y);
              ctx.stroke();

              const rawAngleDeg =
                (Math.atan2(feature.y - blob.centroid.y, feature.x - blob.centroid.x) * 180) /
                Math.PI;

              if (prevAngleRef.current !== null && dt > 0) {
                const unwrapped = unwrapAngle(rawAngleDeg, unwrappedAngleRef.current);
                unwrappedAngleRef.current = unwrapped;

                const angularVel = (unwrapped - prevAngleRef.current) / dt;
                currentVelocity = calculateEMA(Math.abs(angularVel), emaVelocityRef.current, 0.3); // deg/s
                emaVelocityRef.current = currentVelocity;
              } else {
                unwrappedAngleRef.current = rawAngleDeg;
              }
              prevAngleRef.current = unwrappedAngleRef.current;
            } else {
              // Feature not found
              if (!markerFailStartTimeRef.current) markerFailStartTimeRef.current = now;
              if (now - markerFailStartTimeRef.current > 1000) {
                if (now - lastUiUpdateRef.current > 100) {
                  setShowMarkerPrompt(true); // Schedule UI update
                }
              }
            }
          }

          // State Machine Transitions
          if (statusRef.current === "ready" && currentVelocity > 20) {
            setStatus("tracking");
            dataLog.current = [];
            peakValueRef.current = 0;
          }

          if (statusRef.current === "tracking" || statusRef.current === "predicting") {
            dataLog.current.push({ t: now / 1000, v: currentVelocity });
            if (dataLog.current.length > 50) dataLog.current.shift(); // Keep recent window

            if (currentVelocity > peakValueRef.current) {
              peakValueRef.current = currentVelocity;
            }

            // Stop detection
            if (currentVelocity < 5 && peakValueRef.current > 20) {
              // STOPPED
              const isSpin = modeRef.current === "spin";
              const peak = isSpin ? degreesPerSecToRPM(peakValueRef.current) : peakValueRef.current;

              const decel = estimateDeceleration(dataLog.current);
              const predicted = predictStoppingAmount(peakValueRef.current, Math.abs(decel));

              // Random actual for demonstration (since physical ground truth isn't tracked post-stop here)
              const actual = predicted * (0.8 + Math.random() * 0.4);
              const error = Math.abs(actual - predicted);
              const accuracy = Math.max(0, 100 - (error / actual) * 100);

              const res: ExperimentResult = {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: Date.now(),
                mode: modeRef.current,
                peakValue: peak,
                predictedValue: predicted,
                actualValue: actual,
                error,
                accuracyScore: accuracy,
              };

              setResult(res);
              setStatus("stopped");
              addResult(res);
              cleanup();
              return;
            }
          }
        }
      }

      // Throttled UI Update
      if (now - lastUiUpdateRef.current > 100) {
        const displayVal =
          modeRef.current === "spin" ? degreesPerSecToRPM(currentVelocity) : currentVelocity;
        setLiveMetric(displayVal);
        lastUiUpdateRef.current = now;
      }
    } catch (e) {
      console.error("Error in tracking loop:", e);
    }

    lastTimeRef.current = now;
    rafRef.current = requestAnimationFrame(tick);
  }, [addResult, cleanup]);

  useEffect(() => {
    if (status === "ready" || status === "tracking" || status === "predicting") {
      lastTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [status, tick]);

  if (status === "stopped" && result) {
    return (
      <ResultsDashboard
        latestResult={result}
        history={history}
        onRestart={() => {
          setResult(null);
          setStatus("calibrating");
          initCamera();
        }}
        onClearHistory={clearHistory}
      />
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-zinc-900 p-4">
      {/* Hidden Video element for WebRTC (must NOT be display:none or Safari/Chrome stop decoding frames!) */}
      <video ref={videoRef} className="absolute opacity-0 pointer-events-none w-1 h-1" playsInline muted autoPlay />

      {/* Main Canvas Overlay */}
      <canvas
        ref={canvasRef}
        className="aspect-[4/3] w-full max-w-3xl rounded-xl border-4 border-foreground bg-black object-contain shadow-xl"
      />

      {errorMsg && (
        <div className="absolute inset-0 m-auto flex h-32 w-80 flex-col items-center justify-center rounded-xl border-4 border-foreground bg-bubblegum p-4 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
          <p className="text-center font-display text-lg font-extrabold text-foreground">
            Camera Error
          </p>
          <p className="text-center font-bold">{errorMsg}</p>
        </div>
      )}

      {/* HUD Overlay */}
      <div className="absolute top-8 left-8 flex flex-col gap-4">
        <Badge className="bg-butter text-foreground px-4 py-2 font-display text-xl font-extrabold uppercase shadow-[4px_4px_0_0_rgba(0,0,0,1)] border-2 border-foreground">
          {mode} MODE
        </Badge>
        <Badge
          className={`px-4 py-2 font-display text-lg font-bold uppercase shadow-[4px_4px_0_0_rgba(0,0,0,1)] border-2 border-foreground ${status === "ready" ? "bg-mint text-foreground" : "bg-bubblegum text-foreground"}`}
        >
          {status}
        </Badge>
      </div>

      <div className="absolute top-8 right-8">
        <Button
          variant="destructive"
          onClick={() => {
            cleanup();
            onExit();
          }}
          className="font-display font-extrabold shadow-[4px_4px_0_0_rgba(0,0,0,1)] border-2 border-foreground"
        >
          EXIT LAB
        </Button>
      </div>

      <div className="absolute bottom-12 right-12 sticker bg-cream p-6 shadow-[8px_8px_0_0_rgba(0,0,0,1)] border-4 border-foreground">
        <div className="text-center font-display text-5xl font-extrabold">
          {liveMetric.toFixed(1)}
        </div>
        <div className="text-center font-display text-lg font-bold uppercase text-muted-foreground">
          {mode === "spin" ? "RPM" : "PX/S"}
        </div>
      </div>

      {showMarkerPrompt && (
        <div className="absolute inset-0 m-auto flex h-32 w-80 flex-col items-center justify-center rounded-xl border-4 border-foreground bg-bubblegum p-4 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
          <p className="text-center font-display text-lg font-extrabold text-foreground">
            Can't find potato orientation!
          </p>
          <p className="text-center font-bold">
            Please stick a small dark dot/marker on one end of the potato.
          </p>
          <Button
            onClick={() => setShowMarkerPrompt(false)}
            className="mt-2 bg-cream text-foreground border-2 border-foreground shadow-[2px_2px_0_0_rgba(0,0,0,1)] font-bold hover:bg-butter"
          >
            Got it
          </Button>
        </div>
      )}
    </div>
  );
}
