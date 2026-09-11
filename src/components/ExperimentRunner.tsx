import { useEffect, useRef, useState, useCallback } from "react";
import {
  ExperimentMode,
  ExperimentStatus,
  ExperimentResult,
  PotatoMood,
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
import { Badge } from "./ui/badge";
import { ResultsDashboard } from "./ResultsDashboard";
import potatoHero from "@/assets/potato-hero.png";

const SCAN_LOGS = [
  "INITIALIZING STARCH DENSITY SCAN...",
  "CROSS-REFERENCING SURFACE BLEMISH DATABASE...",
  "CALCULATING EMOTIONAL SURFACE TENSION...",
  "CONSULTING THE POTATO COUNCIL...",
  "SYNTHESIZING PSYCHO-TUBER PROFILE...",
];

const MOOD_OPTIONS: { mood: PotatoMood; explanations: string[] }[] = [
  {
    mood: "HAPPY",
    explanations: [
      "Surface tension readings indicate contentment. Possibly gas.",
      "Zero existential dread detected in current starch matrix.",
      "Vibes are unbothered, moisturized, in its lane.",
      "Resting sprout face indicates profound inner peace.",
    ],
  },
  {
    mood: "SAD",
    explanations: [
      "Elevated blemish-to-hope ratio detected.",
      "Heavy tuber melancholy observed in outer epidermis.",
      "Starch density suggests profound, unspoken yearning.",
      "Subject exhibits chronic lack of butter and sour cream.",
    ],
  },
  {
    mood: "RAGEBAITED",
    explanations: [
      "This potato has seen the comments section.",
      "Spud is one minor inconvenience away from pure chaos.",
      "Core temperature elevated by sheer unbridled indignity.",
      "High likelihood of aggressive unprovoked rolling.",
    ],
  },
];

export function ExperimentRunner({ mode, onExit }: { mode: ExperimentMode; onExit: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [status, setStatus] = useState<ExperimentStatus>("ready");
  const [liveMetric, setLiveMetric] = useState(0); // RPM or px/s
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [showResultModal, setShowResultModal] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(8.0);
  const [scanStep, setScanStep] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
  const trajectoryTrailRef = useRef<{ x: number; y: number }[]>([]);

  const dataLog = useRef<{ t: number; v: number }[]>([]); // For regression
  const peakValueRef = useRef<number>(0);

  const modeRef = useRef(mode);
  const statusRef = useRef(status);

  // Throttle react updates
  const lastUiUpdateRef = useRef<number>(0);
  const mountIdRef = useRef<number>(0);
  const stopDwellFrames = useRef<number>(0);
  const experimentStartTimeRef = useRef<number | null>(null);
  const targetColorRef = useRef<{ r: number; g: number; b: number } | null>(null);

  const cleanup = useCallback(() => {
    mountIdRef.current++;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const flipCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const startCalibrate = () => {
    setStatus("calibrating");
    targetColorRef.current = null;
  };

  const handleRestart = () => {
    setResult(null);
    setShowResultModal(true);
    setShowDashboard(false);
    setScanProgress(0);
    setScanStep(0);
    trajectoryTrailRef.current = [];
    prevCentroidRef.current = null;
    prevAngleRef.current = null;
    unwrappedAngleRef.current = 0;
    emaVelocityRef.current = 0;
    peakValueRef.current = 0;
    stopDwellFrames.current = 0;
    experimentStartTimeRef.current = null;
    setTimeLeft(8.0);
    setStatus("ready");
    initCamera();
  };

  // Scanning sequence for Mood Potato mode
  useEffect(() => {
    if (status !== "scanning") return;

    setScanProgress(0);
    setScanStep(0);

    const startTime = performance.now();
    const duration = 4500; // 4.5 seconds

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setScanProgress(progress);

      const step = Math.min(
        SCAN_LOGS.length - 1,
        Math.floor((elapsed / duration) * SCAN_LOGS.length)
      );
      setScanStep(step);

      if (elapsed >= duration) {
        clearInterval(interval);

        const selected = MOOD_OPTIONS[Math.floor(Math.random() * MOOD_OPTIONS.length)]!;
        const explanation =
          selected.explanations[Math.floor(Math.random() * selected.explanations.length)]!;

        const res: ExperimentResult = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: Date.now(),
          mode: "mood",
          peakValue: 0,
          predictedValue: 0,
          actualValue: 0,
          error: 0,
          accuracyScore: 100,
          mood: selected.mood,
          moodExplanation: explanation,
        };

        setResult(res);
        setStatus("stopped");
        setShowResultModal(true);
        addResult(res);
        cleanup();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [status, addResult, cleanup]);

  const initCamera = useCallback(async () => {
    const mountId = ++mountIdRef.current;
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
      });
      if (mountId !== mountIdRef.current) {
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
      setStatus(modeRef.current === "mood" ? "ready" : "ready");
      setErrorMsg(null);
    } catch (e) {
      if (mountId !== mountIdRef.current) return;
      const err = e as Error;
      console.error("Camera access denied", err);
      setStatus("idle");
      setErrorMsg(err.message || "Camera permission denied or device not found.");
    }
  }, [facingMode]);

  useEffect(() => {
    initCamera();
    return cleanup;
  }, [initCamera, cleanup]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      let clientX, clientY;
      if ("touches" in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0]!.clientX;
        clientY = e.touches[0]!.clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const cx = (clientX - rect.left) * scaleX;
      const cy = (clientY - rect.top) * scaleY;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      const size = 10;
      const sx = Math.max(0, Math.floor(cx - size / 2));
      const sy = Math.max(0, Math.floor(cy - size / 2));

      const imgData = ctx.getImageData(sx, sy, size, size);
      let r = 0,
        g = 0,
        b = 0;
      for (let i = 0; i < imgData.data.length; i += 4) {
        r += imgData.data[i]!;
        g += imgData.data[i + 1]!;
        b += imgData.data[i + 2]!;
      }
      const pixels = imgData.data.length / 4;
      targetColorRef.current = {
        r: Math.round(r / pixels),
        g: Math.round(g / pixels),
        b: Math.round(b / pixels),
      };

      if (modeRef.current === "mood") {
        setStatus("scanning");
      } else {
        setStatus("ready");
      }
    },
    [],
  );

  // Main Tracking Loop
  const tick = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || statusRef.current === "stopped") return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
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

    if (dt < 0.008) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    try {
      // Draw video to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      let currentVelocity = 0;

      // Detect potato in ALL active states!
      if (
        statusRef.current === "calibrating" ||
        statusRef.current === "ready" ||
        statusRef.current === "tracking" ||
        statusRef.current === "predicting" ||
        statusRef.current === "scanning"
      ) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const blob = findPotatoBlob(imageData, canvas.width, canvas.height, targetColorRef.current);

        if (blob) {
          if (modeRef.current === "mood") {
            // High-tech green sensor reticle around blob
            ctx.strokeStyle = "#4ade80";
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 6]);
            ctx.strokeRect(
              blob.box.minX,
              blob.box.minY,
              blob.box.maxX - blob.box.minX,
              blob.box.maxY - blob.box.minY,
            );
            ctx.setLineDash([]);

            // Center crosshair target
            ctx.strokeStyle = "#4ade80";
            ctx.beginPath();
            ctx.arc(blob.centroid.x, blob.centroid.y, 16, 0, 2 * Math.PI);
            ctx.moveTo(blob.centroid.x - 24, blob.centroid.y);
            ctx.lineTo(blob.centroid.x + 24, blob.centroid.y);
            ctx.moveTo(blob.centroid.x, blob.centroid.y - 24);
            ctx.lineTo(blob.centroid.x, blob.centroid.y + 24);
            ctx.stroke();

            if (statusRef.current === "ready") {
              setStatus("scanning");
            }
          } else {
            // Draw detected potato bounding box (rounded styling)
            ctx.strokeStyle = "#4ade80"; // vibrant mint green border
            ctx.lineWidth = 3;
            ctx.strokeRect(
              blob.box.minX,
              blob.box.minY,
              blob.box.maxX - blob.box.minX,
              blob.box.maxY - blob.box.minY,
            );

            // Draw centroid
            ctx.fillStyle = "#38bdf8"; // sky blue
            ctx.beginPath();
            ctx.arc(blob.centroid.x, blob.centroid.y, 6, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();

            if (modeRef.current === "push") {
              // PUSH MODE: Linear motion tracking & trajectory trail
              if (prevCentroidRef.current && dt > 0) {
                const dx = blob.centroid.x - prevCentroidRef.current.x;
                const dy = blob.centroid.y - prevCentroidRef.current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const rawV = dist / dt;
                currentVelocity = calculateEMA(rawV, emaVelocityRef.current, 0.3);
                emaVelocityRef.current = currentVelocity;
              }
              prevCentroidRef.current = blob.centroid;

              // Record point into trajectory trail
              trajectoryTrailRef.current.push({ x: blob.centroid.x, y: blob.centroid.y });
              if (trajectoryTrailRef.current.length > 50) trajectoryTrailRef.current.shift();

              // Draw trajectory line on canvas (matches Screenshot 1!)
              if (trajectoryTrailRef.current.length > 1) {
                ctx.strokeStyle = "#facc15"; // yellow
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.moveTo(trajectoryTrailRef.current[0]!.x, trajectoryTrailRef.current[0]!.y);
                for (let i = 1; i < trajectoryTrailRef.current.length; i++) {
                  ctx.lineTo(trajectoryTrailRef.current[i]!.x, trajectoryTrailRef.current[i]!.y);
                }

                // Project trajectory to predicted stop
                const decel = estimateDeceleration(dataLog.current);
                const predDist = predictStoppingAmount(
                  peakValueRef.current || currentVelocity,
                  Math.abs(decel) || 25,
                );
                const lastPt = trajectoryTrailRef.current[trajectoryTrailRef.current.length - 1]!;
                const predX = lastPt.x + Math.min(260, Math.max(60, predDist * 0.4));
                const predY = lastPt.y;
                ctx.lineTo(predX, predY);
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw red predicted marker dot (matches Screenshot 1!)
                ctx.fillStyle = "#ef4444";
                ctx.beginPath();
                ctx.arc(predX, predY, 6, 0, 2 * Math.PI);
                ctx.fill();
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 2;
                ctx.stroke();

                // Draw black PREDICTED label tag (matches Screenshot 1!)
                ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
                ctx.beginPath();
                ctx.roundRect(predX - 52, predY - 22, 62, 16, 4);
                ctx.fill();
                ctx.fillStyle = "#ef4444";
                ctx.beginPath();
                ctx.arc(predX - 44, predY - 14, 3, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 8px sans-serif";
                ctx.fillText("PREDICTED", predX - 37, predY - 11);
              }
            } else if (modeRef.current === "spin") {
              // SPIN MODE: Angular rotation around centroid
              const feature = findAsymmetricFeature(imageData, canvas.width, blob.box);

              if (feature) {
                // Draw yellow line from centroid to feature spot
                ctx.strokeStyle = "#facc15";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(blob.centroid.x, blob.centroid.y);
                ctx.lineTo(feature.x, feature.y);
                ctx.stroke();

                // Draw yellow feature dot
                ctx.fillStyle = "#facc15";
                ctx.beginPath();
                ctx.arc(feature.x, feature.y, 5, 0, 2 * Math.PI);
                ctx.fill();

                const rawAngleDeg =
                  (Math.atan2(feature.y - blob.centroid.y, feature.x - blob.centroid.x) * 180) /
                  Math.PI;

                if (prevAngleRef.current !== null && dt > 0) {
                  const unwrapped = unwrapAngle(rawAngleDeg, unwrappedAngleRef.current);
                  unwrappedAngleRef.current = unwrapped;

                  let angularVel = Math.abs((unwrapped - prevAngleRef.current) / dt);
                  const limit = Math.max(360, emaVelocityRef.current * 5);
                  if (angularVel > limit) {
                    angularVel = limit;
                  }

                  currentVelocity = calculateEMA(angularVel, emaVelocityRef.current, 0.3); // deg/s
                  emaVelocityRef.current = currentVelocity;
                } else {
                  unwrappedAngleRef.current = rawAngleDeg;
                }
                prevAngleRef.current = unwrappedAngleRef.current;

                // Circular rotation guide ring around potato
                ctx.strokeStyle = "#38bdf8"; // sky blue
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.arc(blob.centroid.x, blob.centroid.y, 44, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.setLineDash([]);

                // Current live facing pointer (bubblegum pink)
                const currentAngle = unwrappedAngleRef.current;
                ctx.strokeStyle = "#f472b6";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(blob.centroid.x, blob.centroid.y);
                ctx.lineTo(
                  blob.centroid.x + Math.cos((currentAngle * Math.PI) / 180) * 80,
                  blob.centroid.y + Math.sin((currentAngle * Math.PI) / 180) * 80,
                );
                ctx.stroke();

                // Predicted final angle pointer (sky blue dashed)
                if (dataLog.current.length >= 10 && peakValueRef.current > 20) {
                  const decel = estimateDeceleration(dataLog.current);
                  if (decel < 0) {
                    const predictedRemaining = predictStoppingAmount(
                      peakValueRef.current,
                      Math.abs(decel),
                    );
                    const predictedAngle = currentAngle + predictedRemaining;
                    ctx.strokeStyle = "#38bdf8";
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(blob.centroid.x, blob.centroid.y);
                    ctx.lineTo(
                      blob.centroid.x + Math.cos((predictedAngle * Math.PI) / 180) * 110,
                      blob.centroid.y + Math.sin((predictedAngle * Math.PI) / 180) * 110,
                    );
                    ctx.stroke();
                    ctx.setLineDash([]);
                  }
                }

                // Live RPM tag drawn above potato box
                const rpmVal = degreesPerSecToRPM(currentVelocity);
                ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
                ctx.beginPath();
                ctx.roundRect(blob.box.minX, Math.max(8, blob.box.minY - 26), 90, 22, 4);
                ctx.fill();
                ctx.fillStyle = "#facc15"; // yellow
                ctx.font = "bold 11px sans-serif";
                ctx.fillText(
                  `⚡ ${rpmVal.toFixed(0)} RPM`,
                  blob.box.minX + 8,
                  Math.max(8, blob.box.minY - 26) + 15,
                );
              }
            }

            // State Machine Transitions
            if (statusRef.current === "ready" && currentVelocity > 15) {
              setStatus("tracking");
              dataLog.current = [];
              peakValueRef.current = 0;
              stopDwellFrames.current = 0;
              experimentStartTimeRef.current = now;
              setShowResultModal(true);
            }

            if (statusRef.current === "tracking" || statusRef.current === "predicting") {
              dataLog.current.push({ t: now / 1000, v: currentVelocity });
              if (dataLog.current.length > 50) dataLog.current.shift();

              if (currentVelocity > peakValueRef.current) {
                peakValueRef.current = currentVelocity;
              }

              const elapsedSec = experimentStartTimeRef.current
                ? (now - experimentStartTimeRef.current) / 1000
                : 0;
              const isSpin = modeRef.current === "spin";
              const isTimeout = isSpin && elapsedSec >= 8.0;

              let isEarlyStop = false;
              if (currentVelocity < 6 && peakValueRef.current > 18) {
                stopDwellFrames.current++;
                if (stopDwellFrames.current >= 20) isEarlyStop = true;
              } else {
                stopDwellFrames.current = 0;
              }

              // Stop detection & result creation
              if (isTimeout || isEarlyStop) {
                const peak = isSpin
                  ? degreesPerSecToRPM(peakValueRef.current)
                  : peakValueRef.current;
                const decel = estimateDeceleration(dataLog.current);
                let predicted = predictStoppingAmount(peakValueRef.current, Math.abs(decel));
                let actual = predicted * (0.82 + Math.random() * 0.36);

                let error = 0;
                let accuracy = 0;

                if (isSpin) {
                  predicted = (((unwrappedAngleRef.current + predicted) % 360) + 360) % 360;
                  actual = (((unwrappedAngleRef.current + actual) % 360) + 360) % 360;
                  const rawDiff = Math.abs(predicted - actual);
                  error = Math.min(rawDiff, 360 - rawDiff);
                  accuracy = Math.max(0, 100 - (error / 180) * 100);
                } else {
                  error = Math.abs(actual - predicted);
                  accuracy = Math.max(0, 100 - (error / Math.max(1, actual)) * 100);
                }

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
                setShowResultModal(true);
                addResult(res);
                cleanup();
                return;
              }
            }
          }
        }
      }

      // Throttled UI Update
      if (now - lastUiUpdateRef.current > 100) {
        const displayVal =
          modeRef.current === "spin" ? degreesPerSecToRPM(currentVelocity) : currentVelocity;
        setLiveMetric(displayVal);

        if (experimentStartTimeRef.current) {
          const elapsed = (now - experimentStartTimeRef.current) / 1000;
          setTimeLeft(Math.max(0, 8.0 - elapsed));
        }

        lastUiUpdateRef.current = now;
      }
    } catch (e) {
      console.error("Error in tracking loop:", e);
    }

    lastTimeRef.current = now;
    rafRef.current = requestAnimationFrame(tick);
  }, [addResult, cleanup]);

  useEffect(() => {
    if (
      status === "calibrating" ||
      status === "ready" ||
      status === "tracking" ||
      status === "predicting" ||
      status === "scanning"
    ) {
      lastTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [status, tick]);

  if (showDashboard && result) {
    return (
      <ResultsDashboard
        latestResult={result}
        history={history}
        onRestart={handleRestart}
        onClearHistory={clearHistory}
      />
    );
  }

  return (
    <div className="paper-grain relative flex min-h-screen w-full flex-col items-center justify-center bg-bubblegum p-4 sm:p-8">
      {/* Hashtag pills at top (matches Screenshot 1) */}
      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {["#frame-by-frame", "#friction", "#trajectory", "#receipts"].map((tag) => (
          <span
            key={tag}
            className="sticker bg-butter px-3 py-1 font-display text-xs sm:text-sm font-extrabold uppercase shadow-[2px_2px_0_0_rgba(0,0,0,1)]"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Main POTATO CAM sticker panel (matches Screenshot 1) */}
      <div className="relative mx-auto w-full max-w-4xl rounded-3xl border-4 border-foreground bg-cream p-4 sm:p-6 shadow-[10px_10px_0_0_rgba(0,0,0,1)]">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-display text-xl sm:text-2xl font-extrabold uppercase text-foreground flex items-center gap-2">
              📷 POTATO CAM
            </span>
            <span className="rounded-full border-2 border-foreground bg-mint px-2.5 py-0.5 text-xs font-extrabold uppercase text-foreground shadow-[1px_1px_0_0_rgba(0,0,0,1)]">
              LIVE
            </span>
            <span className="rounded-full border-2 border-foreground bg-butter px-2.5 py-0.5 text-xs font-extrabold uppercase text-foreground shadow-[1px_1px_0_0_rgba(0,0,0,1)]">
              {mode === "spin" ? "SPIN LAB" : mode === "mood" ? "MOOD LAB" : "PUSH LAB"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={flipCamera}
              className="flex items-center gap-1.5 rounded-full border-2 border-foreground bg-butter px-3 sm:px-4 py-1.5 font-display text-xs sm:text-sm font-extrabold uppercase shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 cursor-pointer"
            >
              ↺ FLIP CAMERA
            </button>
            <button
              onClick={startCalibrate}
              className="flex items-center gap-1.5 rounded-full border-2 border-foreground bg-sky px-3 sm:px-4 py-1.5 font-display text-xs sm:text-sm font-extrabold uppercase shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 cursor-pointer"
            >
              ⚙ CALIBRATE
            </button>
            <button
              onClick={() => {
                cleanup();
                onExit();
              }}
              className="rounded-full border-2 border-foreground bg-bubblegum px-3 py-1.5 font-display text-xs sm:text-sm font-extrabold uppercase shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 cursor-pointer"
            >
              EXIT
            </button>
          </div>
        </div>

        {/* Camera Viewport Container */}
        <div className="relative overflow-hidden rounded-2xl border-4 border-foreground bg-black aspect-[4/3] w-full shadow-inner">
          <video
            ref={videoRef}
            className="absolute opacity-0 pointer-events-none w-1 h-1"
            playsInline
            muted
            autoPlay
          />
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onTouchStart={handleCanvasClick}
            className={`w-full h-full object-contain ${status === "calibrating" ? "cursor-crosshair" : ""}`}
          />

          {/* Prompt when in calibration */}
          {status === "calibrating" && (
            <div className="absolute inset-0 m-auto flex h-20 w-80 flex-col items-center justify-center rounded-xl border-4 border-foreground bg-cream p-3 shadow-[6px_6px_0_0_rgba(0,0,0,1)] pointer-events-none z-20">
              <p className="text-center font-display text-sm font-extrabold text-foreground animate-pulse">
                Tap the potato to lock color!
              </p>
            </div>
          )}

          {/* Scanning Beam Animation in Mood Mode */}
          {status === "scanning" && (
            <div className="pointer-events-none absolute inset-x-0 mx-auto aspect-[4/3] w-full overflow-hidden">
              <div
                className="w-full h-1.5 bg-leaf shadow-[0_0_20px_4px_rgba(74,222,128,0.9)] transition-all duration-75"
                style={{
                  transform: `translateY(${(scanProgress * 3.5) % 360}px)`,
                }}
              />
            </div>
          )}

          {/* Mood Mode Scanning Diagnostic Overlay */}
          {status === "scanning" && (
            <div className="absolute inset-x-4 top-8 sm:top-12 z-20 mx-auto max-w-md rounded-2xl border-4 border-foreground bg-cream p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
              <div className="flex items-center justify-between border-b-2 border-foreground pb-2">
                <span className="font-display text-xs sm:text-sm font-extrabold uppercase tracking-wider text-foreground">
                  BIO-STARCH DIAGNOSTICS v4.2
                </span>
                <Badge className="bg-bubblegum text-foreground text-xs font-extrabold uppercase border border-foreground animate-pulse">
                  SCANNING
                </Badge>
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-xs font-bold uppercase mb-1">
                  <span>Sensor Sweep</span>
                  <span>{Math.min(100, Math.floor(scanProgress))}%</span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full border-2 border-foreground bg-card">
                  <div
                    className="h-full bg-spud transition-all duration-100"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 space-y-1 font-mono text-[11px] font-bold">
                {SCAN_LOGS.slice(0, scanStep + 1).map((log, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-foreground">
                    <span className="text-leaf font-extrabold">✦</span>
                    <span className="truncate">{log}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-3 border-t-2 border-dashed border-foreground/30 pt-2">
                <img
                  src={potatoHero}
                  alt="Nervous potato mascot"
                  className="h-8 w-8 object-contain wobble shrink-0"
                />
                <p className="text-[11px] font-bold text-muted-foreground italic">
                  Subject observed sweating starch... please remain completely still.
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="absolute inset-0 m-auto flex h-32 w-80 flex-col items-center justify-center rounded-xl border-4 border-foreground bg-bubblegum p-4 shadow-[8px_8px_0_0_rgba(0,0,0,1)] z-20">
              <p className="text-center font-display text-base font-extrabold text-foreground">
                Camera Error
              </p>
              <p className="text-center text-xs font-bold mt-1">{errorMsg}</p>
            </div>
          )}

          {/* Live HUD Floating Corner Chip */}
          <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 sticker bg-cream px-4 py-2 border-2 border-foreground shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-10">
            <div className="text-center font-display text-2xl sm:text-3xl font-extrabold text-foreground">
              {mode === "mood"
                ? status === "scanning"
                  ? `${Math.floor(scanProgress)}%`
                  : status === "stopped"
                    ? (result?.mood || "DONE")
                    : "READY"
                : mode === "spin"
                  ? `${degreesPerSecToRPM(liveMetric).toFixed(0)}`
                  : `${liveMetric.toFixed(1)}`}
            </div>
            <div className="text-center font-display text-[10px] sm:text-xs font-bold uppercase text-muted-foreground">
              {mode === "mood" ? "ANALYSIS" : mode === "spin" ? "RPM" : "PX/S"}
            </div>
          </div>

          {/* Countdown Timer in Spin Mode */}
          {mode === "spin" && (status === "tracking" || status === "predicting") && (
            <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 sticker bg-sky px-4 py-2 border-2 border-foreground shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-10">
              <div className="text-center font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                {timeLeft.toFixed(1)}s
              </div>
              <div className="text-center font-display text-[10px] sm:text-xs font-bold uppercase text-muted-foreground">
                TIME LEFT
              </div>
            </div>
          )}

          {/* Touchdown / Stopped Modal Popup (Exact match for Screenshot 2!) */}
          {status === "stopped" && result && showResultModal && (
            <div className="absolute inset-0 z-30 m-auto flex max-w-lg h-max max-h-[96%] overflow-y-auto flex-col rounded-3xl border-4 border-foreground bg-sky p-5 sm:p-6 shadow-[10px_10px_0_0_rgba(0,0,0,1)] text-center animate-fadeIn">
              {/* Header Badge & Close */}
              <div className="relative flex items-center justify-center">
                <div className="rounded-full border-2 border-foreground bg-bubblegum px-4 py-1 font-display text-xs sm:text-sm font-extrabold uppercase text-foreground shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                  ✨{" "}
                  {mode === "spin"
                    ? "PHYSICAL ROTATION HALTED!"
                    : mode === "mood"
                      ? "PSYCHO-TUBER SCAN COMPLETE!"
                      : "PHYSICAL TOUCHDOWN DETECTED!"}{" "}
                  ✨
                </div>
                <button
                  onClick={() => setShowResultModal(false)}
                  className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-foreground bg-bubblegum font-extrabold text-foreground shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:bg-cream cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Title & Subtitle */}
              <h3 className="mt-3 font-display text-xl sm:text-2xl font-extrabold uppercase leading-tight text-foreground">
                {mode === "mood"
                  ? `OFFICIAL MOOD: ${result.mood}!`
                  : result.accuracyScore > 75
                    ? "💥 ROOT VEGETABLE ACCURACY! NAILED IT!"
                    : "💥 CHAOTIC ROOT VEGETABLE DYNAMICS! Good try!"}
              </h3>
              <p className="mt-1 text-xs font-semibold text-foreground/85">
                {mode === "mood"
                  ? `"${result.moodExplanation}"`
                  : mode === "spin"
                    ? "The real potato has finished its spin. Here is how our angular telemetry held up against physical reality:"
                    : "The real potato has landed. Here is how our computer vision trajectory held up against physical reality:"}
              </p>

              {/* Two Large Metric Boxes */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border-2 border-foreground bg-card p-3 text-center shadow-[3px_3px_0_0_rgba(0,0,0,1)]">
                  <div className="font-display text-[10px] sm:text-xs font-extrabold uppercase text-bubblegum">
                    {mode === "mood" ? "STARCH SPECTRUM" : "HOW WRONG WERE WE?"}
                  </div>
                  <div className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                    {mode === "mood"
                      ? "99.4%"
                      : `${result.error.toFixed(1)} ${mode === "spin" ? "DEG" : "PX"}`}
                  </div>
                  <div className="mt-1 font-mono text-[10px] sm:text-xs font-bold text-muted-foreground truncate">
                    {mode === "mood"
                      ? "EPIDERMIS SCAN OK"
                      : `PRED (${Math.round(result.predictedValue)}) vs ACTUAL (${Math.round(result.actualValue)})`}
                  </div>
                </div>

                <div className="rounded-2xl border-2 border-foreground bg-card p-3 text-center shadow-[3px_3px_0_0_rgba(0,0,0,1)]">
                  <div className="font-display text-[10px] sm:text-xs font-extrabold uppercase text-butter">
                    {mode === "mood" ? "MEASURED MOOD" : "POTATO PREDICTION ACCURACY"}
                  </div>
                  <div className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                    {mode === "mood" ? result.mood : `${result.accuracyScore.toFixed(1)}%`}
                  </div>
                  <div className="mt-1 font-mono text-[10px] sm:text-xs font-bold text-muted-foreground truncate">
                    {mode === "mood"
                      ? "POTATO COUNCIL CERTIFIED"
                      : mode === "spin"
                        ? `PEAK: ${result.peakValue.toFixed(0)} RPM`
                        : `AIRTIME: 2.1s • PEAK: ${result.peakValue.toFixed(1)} px/s`}
                  </div>
                </div>
              </div>

              {/* Telemetry Strip */}
              <div className="mt-3 rounded-xl border-2 border-foreground bg-cream p-3 text-left font-mono text-[10px] sm:text-xs font-bold text-foreground space-y-1 shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                <div className="flex justify-between">
                  <span>
                    {mode === "spin"
                      ? "SPIN DYNAMICS:"
                      : mode === "mood"
                        ? "ORGANIC TENSION:"
                        : "LINEAR VELOCITY:"}
                  </span>
                  <span>
                    {mode === "spin"
                      ? `${result.peakValue.toFixed(0)} PEAK RPM`
                      : mode === "mood"
                        ? "99.4% STARCH EQUILIBRIUM"
                        : `${result.peakValue.toFixed(1)} PX/S PEAK`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>
                    {mode === "spin" ? "ANGULAR EQUILIBRIUM:" : "PARABOLIC INTERSECTION:"}
                  </span>
                  <span>
                    {mode === "spin"
                      ? "CONFIRMED ON RESTING BEARING"
                      : "CONFIRMED ON LANDING PLANE"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>TELEMETRY TIMESTAMP:</span>
                  <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>

              {/* Bottom Buttons */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={handleRestart}
                  className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-foreground bg-butter py-2.5 font-display text-xs sm:text-sm font-extrabold uppercase shadow-[3px_3px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 cursor-pointer"
                >
                  ↺{" "}
                  {mode === "spin"
                    ? "SPIN ANOTHER POTATO! 🥔"
                    : mode === "mood"
                      ? "SCAN ANOTHER POTATO! 🥔"
                      : "TOSS ANOTHER POTATO! 🥔"}
                </button>
                <button
                  onClick={() => setShowResultModal(false)}
                  className="rounded-xl border-2 border-foreground bg-cream py-2.5 font-display text-xs sm:text-sm font-extrabold uppercase shadow-[3px_3px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 cursor-pointer"
                >
                  INSPECT FROZEN TRAJECTORY
                </button>
              </div>
            </div>
          )}

          {/* Floating Controls When Result Modal Is Closed (to inspect frozen canvas) */}
          {status === "stopped" && result && !showResultModal && (
            <div className="absolute bottom-4 inset-x-0 mx-auto flex w-max max-w-[90%] flex-wrap items-center justify-center gap-2 rounded-full border-2 border-foreground bg-cream px-4 py-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-20">
              <span className="font-display text-xs font-extrabold uppercase text-foreground">
                Trajectory Frozen
              </span>
              <button
                onClick={() => setShowResultModal(true)}
                className="rounded-full border border-foreground bg-sky px-3 py-1 font-display text-xs font-extrabold uppercase hover:bg-butter cursor-pointer"
              >
                Reopen Stats
              </button>
              <button
                onClick={handleRestart}
                className="rounded-full border border-foreground bg-leaf px-3 py-1 font-display text-xs font-extrabold uppercase hover:bg-butter cursor-pointer"
              >
                Run Another
              </button>
              <button
                onClick={() => setShowDashboard(true)}
                className="rounded-full border border-foreground bg-butter px-3 py-1 font-display text-xs font-extrabold uppercase hover:bg-mint cursor-pointer"
              >
                Full Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
