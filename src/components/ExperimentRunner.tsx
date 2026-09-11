import { useEffect, useRef, useState, useCallback } from "react";
import {
  ExperimentMode,
  ExperimentStatus,
  ExperimentResult,
  PotatoMood,
  useExperimentHistory,
} from "@/lib/experimentState";
import { findPotatoBlob, findAsymmetricFeature, RGB } from "@/lib/vision";
import {
  unwrapAngle,
  normalizeAngle360,
  calculateCircularError,
  calculateAccuracyFromError,
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

// Scale a fixed-pixel size relative to the canvas natural resolution
function scalePx(base: number, canvasWidth: number): number {
  return Math.max(base * 0.5, (base * canvasWidth) / 1280);
}

export function ExperimentRunner({
  mode: initialMode,
  onExit,
}: {
  mode: ExperimentMode;
  onExit: (finalMode?: ExperimentMode) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [currentMode, setCurrentMode] = useState<ExperimentMode>(initialMode);
  const [status, setStatus] = useState<ExperimentStatus>("ready");
  const [liveRPM, setLiveRPM] = useState(0);
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [showResultModal, setShowResultModal] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(8.0);
  const [scanStep, setScanStep] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [calibratedColor, setCalibratedColor] = useState<RGB | null>(null);

  const { history, addResult, clearHistory } = useExperimentHistory();

  // ── Refs (never cause re-renders) ──────────────────────────────────────────
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const mountIdRef = useRef<number>(0);

  // Physics
  const prevCentroidRef = useRef<{ x: number; y: number } | null>(null);
  const prevAngleRef = useRef<number | null>(null); // last unwrapped angle
  const unwrappedAngleRef = useRef<number>(0); // continuously accumulating
  const emaVelocityRef = useRef<number>(0); // deg/s or px/s EMA
  const trajectoryTrailRef = useRef<{ x: number; y: number }[]>([]);
  const dataLog = useRef<{ t: number; v: number }[]>([]); // for regression
  const peakValueRef = useRef<number>(0); // peak velocity this run
  const stopDwellFrames = useRef<number>(0); // consecutive low-vel frames
  const experimentStartTimeRef = useRef<number | null>(null);

  // Tracking helpers
  const startCentroidRef = useRef<{ x: number; y: number } | null>(null);
  const lastKnownCentroidRef = useRef<{ x: number; y: number } | null>(null);
  const blobFoundRef = useRef<boolean>(false);
  const frozenPredictedAngleRef = useRef<number | null>(null); // frozen early in spin
  const targetColorRef = useRef<RGB | null>(null);

  // Mirror status/mode into refs for RAF callback
  const modeRef = useRef(currentMode);
  const statusRef = useRef(status);

  const lastUiUpdateRef = useRef<number>(0);

  // ── Sync refs ──────────────────────────────────────────────────────────────
  useEffect(() => {
    modeRef.current = currentMode;
  }, [currentMode]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    mountIdRef.current++;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Reset all physics state ────────────────────────────────────────────────
  const resetPhysics = useCallback(() => {
    trajectoryTrailRef.current = [];
    prevCentroidRef.current = null;
    prevAngleRef.current = null;
    unwrappedAngleRef.current = 0;
    emaVelocityRef.current = 0;
    peakValueRef.current = 0;
    stopDwellFrames.current = 0;
    experimentStartTimeRef.current = null;
    dataLog.current = [];
    startCentroidRef.current = null;
    lastKnownCentroidRef.current = null;
    blobFoundRef.current = false;
    frozenPredictedAngleRef.current = null;
  }, []);

  // ── Camera init ────────────────────────────────────────────────────────────
  const initCamera = useCallback(async () => {
    const mountId = ++mountIdRef.current;
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
      });
      if (mountId !== mountIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((e) => {
          if (mountId !== mountIdRef.current) return;
          console.error("Play failed", e);
          setStatus("idle");
          setErrorMsg("Video playback failed: " + (e as Error).message);
        });
      }
      setStatus("ready");
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

  // Ensure video element receives stream when returning from dashboard
  useEffect(() => {
    if (!showDashboard && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.error);
    }
  }, [showDashboard]);

  // ── Calibration ────────────────────────────────────────────────────────────
  const startCalibrate = () => {
    setStatus("calibrating");
    targetColorRef.current = null;
    setCalibratedColor(null);
  };

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      // Only capture tap in calibrating state
      if (statusRef.current !== "calibrating") return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      let clientX: number, clientY: number;
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

      const size = 12;
      const sx = Math.max(0, Math.floor(cx - size / 2));
      const sy = Math.max(0, Math.floor(cy - size / 2));
      const sw = Math.min(size, canvas.width - sx);
      const sh = Math.min(size, canvas.height - sy);
      if (sw <= 0 || sh <= 0) return;

      const imgData = ctx.getImageData(sx, sy, sw, sh);
      let r = 0, g = 0, b = 0;
      const pixels = imgData.data.length / 4;
      for (let i = 0; i < imgData.data.length; i += 4) {
        r += imgData.data[i]!;
        g += imgData.data[i + 1]!;
        b += imgData.data[i + 2]!;
      }
      const sampled = {
        r: Math.round(r / pixels),
        g: Math.round(g / pixels),
        b: Math.round(b / pixels),
      };
      targetColorRef.current = sampled;
      setCalibratedColor(sampled);

      // Move to appropriate next state
      if (modeRef.current === "mood") {
        setStatus("scanning");
      } else {
        setStatus("ready");
      }
    },
    [],
  );

  // ── Restart & Switch Mode ──────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    cleanup();
    resetPhysics();
    setResult(null);
    setShowResultModal(true);
    setShowDashboard(false);
    setScanProgress(0);
    setScanStep(0);
    setTimeLeft(8.0);
    setLiveRPM(0);
    setStatus("ready");
    setTimeout(() => {
      initCamera();
    }, 50);
  }, [cleanup, resetPhysics, initCamera]);

  const handleSwitchMode = useCallback(
    (newMode: ExperimentMode) => {
      cleanup();
      resetPhysics();
      setCurrentMode(newMode);
      setResult(null);
      setShowResultModal(true);
      setShowDashboard(false);
      setScanProgress(0);
      setScanStep(0);
      setTimeLeft(8.0);
      setLiveRPM(0);
      setStatus("ready");
      setTimeout(() => {
        initCamera();
      }, 50);
    },
    [cleanup, resetPhysics, initCamera],
  );

  const addResultRef = useRef(addResult);
  useEffect(() => {
    addResultRef.current = addResult;
  }, [addResult]);

  const cleanupRef = useRef(cleanup);
  useEffect(() => {
    cleanupRef.current = cleanup;
  }, [cleanup]);

  // ── Mood scanning sequence ─────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "scanning") return;

    setScanProgress(0);
    setScanStep(0);

    const startTime = performance.now();
    const duration = 4500;

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setScanProgress(progress);

      const step = Math.min(
        SCAN_LOGS.length - 1,
        Math.floor((elapsed / duration) * SCAN_LOGS.length),
      );
      setScanStep(step);

      if (elapsed >= duration) {
        clearInterval(interval);

        const selected = MOOD_OPTIONS[Math.floor(Math.random() * MOOD_OPTIONS.length)]!;
        const explanation =
          selected.explanations[Math.floor(Math.random() * selected.explanations.length)]!;

        const res: ExperimentResult = {
          id: Math.random().toString(36).substring(2, 11),
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
        addResultRef.current(res);
        cleanupRef.current();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [status]);

  // ── Main RAF tracking loop ─────────────────────────────────────────────────
  const tick = useCallback(() => {
    const activeStatuses: ExperimentStatus[] = [
      "calibrating", "ready", "tracking", "predicting", "scanning",
    ];
    if (!videoRef.current || !canvasRef.current) return;
    if (!activeStatuses.includes(statusRef.current)) return;

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

    // Skip frames with near-zero dt to prevent division spikes
    if (dt < 0.008) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      let currentVelocity = 0;
      blobFoundRef.current = false;

      const W = canvas.width;
      const sp = scalePx(1, W); // 1px scaled

      // ── BLOB DETECTION ──────────────────────────────────────────────────
      const imageData = ctx.getImageData(0, 0, W, canvas.height);
      const blob = findPotatoBlob(imageData, W, canvas.height, targetColorRef.current);

      if (blob) {
        blobFoundRef.current = true;
        lastKnownCentroidRef.current = { ...blob.centroid };

        if (modeRef.current === "mood") {
          // ── MOOD MODE: Reticle overlay ──────────────────────────
          ctx.strokeStyle = "#4ade80";
          ctx.lineWidth = 3 * sp;
          ctx.setLineDash([6 * sp, 6 * sp]);
          ctx.strokeRect(blob.box.minX, blob.box.minY, blob.box.maxX - blob.box.minX, blob.box.maxY - blob.box.minY);
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(blob.centroid.x, blob.centroid.y, 16 * sp, 0, 2 * Math.PI);
          ctx.moveTo(blob.centroid.x - 24 * sp, blob.centroid.y);
          ctx.lineTo(blob.centroid.x + 24 * sp, blob.centroid.y);
          ctx.moveTo(blob.centroid.x, blob.centroid.y - 24 * sp);
          ctx.lineTo(blob.centroid.x, blob.centroid.y + 24 * sp);
          ctx.stroke();

          // Auto-advance to scanning once blob confirmed
          if (statusRef.current === "ready") {
            setStatus("scanning");
          }
        } else {
          // ── PUSH / SPIN: Bounding box + Centroid ────────────────
          ctx.strokeStyle = "#4ade80";
          ctx.lineWidth = 3 * sp;
          ctx.strokeRect(blob.box.minX, blob.box.minY, blob.box.maxX - blob.box.minX, blob.box.maxY - blob.box.minY);

          ctx.fillStyle = "#38bdf8";
          ctx.beginPath();
          ctx.arc(blob.centroid.x, blob.centroid.y, 6 * sp, 0, 2 * Math.PI);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2 * sp;
          ctx.stroke();

          if (modeRef.current === "push") {
            // ── PUSH MODE ──────────────────────────────────────────────────
            if (prevCentroidRef.current && dt > 0) {
              const dx = blob.centroid.x - prevCentroidRef.current.x;
              const dy = blob.centroid.y - prevCentroidRef.current.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const rawV = dist / dt;
              currentVelocity = calculateEMA(rawV, emaVelocityRef.current, 0.3);
              emaVelocityRef.current = currentVelocity;
            }
            prevCentroidRef.current = { ...blob.centroid };

            trajectoryTrailRef.current.push({ x: blob.centroid.x, y: blob.centroid.y });
            if (trajectoryTrailRef.current.length > 50) trajectoryTrailRef.current.shift();

            if (trajectoryTrailRef.current.length > 1) {
              ctx.strokeStyle = "#facc15";
              ctx.lineWidth = 3 * sp;
              ctx.setLineDash([8 * sp, 6 * sp]);
              ctx.beginPath();
              ctx.moveTo(trajectoryTrailRef.current[0]!.x, trajectoryTrailRef.current[0]!.y);
              for (let i = 1; i < trajectoryTrailRef.current.length; i++) {
                ctx.lineTo(trajectoryTrailRef.current[i]!.x, trajectoryTrailRef.current[i]!.y);
              }

              const decel = estimateDeceleration(dataLog.current);
              const predDist = predictStoppingAmount(peakValueRef.current || currentVelocity, Math.abs(decel) || 25);
              const lastPt = trajectoryTrailRef.current[trajectoryTrailRef.current.length - 1]!;
              const predX = lastPt.x + Math.min(260 * sp, Math.max(60 * sp, predDist * 0.4));
              const predY = lastPt.y;
              ctx.lineTo(predX, predY);
              ctx.stroke();
              ctx.setLineDash([]);

              // Red predicted dot
              ctx.fillStyle = "#ef4444";
              ctx.beginPath();
              ctx.arc(predX, predY, 6 * sp, 0, 2 * Math.PI);
              ctx.fill();
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = 2 * sp;
              ctx.stroke();

              // PREDICTED label
              const tagW = 64 * sp;
              const tagH = 18 * sp;
              ctx.fillStyle = "rgba(0,0,0,0.85)";
              ctx.beginPath();
              ctx.roundRect(predX - tagW * 0.5, predY - tagH - 6 * sp, tagW, tagH, 4 * sp);
              ctx.fill();
              ctx.fillStyle = "#ffffff";
              ctx.font = `bold ${Math.max(7, 9 * sp)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.fillText("PREDICTED", predX, predY - 8 * sp);
              ctx.textAlign = "start";
            }
          } else if (modeRef.current === "spin") {
            // ── SPIN MODE: Distinct Asymmetric Reference Point ──────────
            const feature = findAsymmetricFeature(imageData, W, blob.box, blob.centroid);

            if (feature) {
              // Line: centroid → reference point
              ctx.strokeStyle = "#facc15";
              ctx.lineWidth = 3 * sp;
              ctx.beginPath();
              ctx.moveTo(blob.centroid.x, blob.centroid.y);
              ctx.lineTo(feature.x, feature.y);
              ctx.stroke();

              // Feature dot
              ctx.fillStyle = "#facc15";
              ctx.beginPath();
              ctx.arc(feature.x, feature.y, 5 * sp, 0, 2 * Math.PI);
              ctx.fill();

              // Angle of reference point relative to centroid
              const rawAngleDeg =
                (Math.atan2(feature.y - blob.centroid.y, feature.x - blob.centroid.x) * 180) /
                Math.PI;
              const normAngle = normalizeAngle360(rawAngleDeg);

              if (prevAngleRef.current !== null) {
                const unwrapped = unwrapAngle(normAngle, unwrappedAngleRef.current);
                unwrappedAngleRef.current = unwrapped;

                // Angular velocity with minimum-dt guard and outlier rejection
                if (dt >= 0.008) {
                  let angularVel = Math.abs((unwrapped - prevAngleRef.current) / dt);
                  // Clamp spikes (max 3600 deg/s = 600 RPM)
                  if (angularVel > 3600) {
                    angularVel = emaVelocityRef.current;
                  }
                  currentVelocity = calculateEMA(angularVel, emaVelocityRef.current, 0.3);
                  emaVelocityRef.current = currentVelocity;
                }
              } else {
                unwrappedAngleRef.current = normAngle;
                prevAngleRef.current = normAngle;
                currentVelocity = 0;
              }
              prevAngleRef.current = unwrappedAngleRef.current;

              const currentAngle = normalizeAngle360(unwrappedAngleRef.current);
              const ringR = 44 * sp;

              // Guide ring
              ctx.strokeStyle = "#38bdf8";
              ctx.lineWidth = 3 * sp;
              ctx.setLineDash([8 * sp, 6 * sp]);
              ctx.beginPath();
              ctx.arc(blob.centroid.x, blob.centroid.y, ringR, 0, 2 * Math.PI);
              ctx.stroke();
              ctx.setLineDash([]);

              // Pink/berry live-angle pointer
              const pointerLen = 80 * sp;
              ctx.strokeStyle = "#f472b6";
              ctx.lineWidth = 4 * sp;
              ctx.beginPath();
              ctx.moveTo(blob.centroid.x, blob.centroid.y);
              ctx.lineTo(
                blob.centroid.x + Math.cos((currentAngle * Math.PI) / 180) * pointerLen,
                blob.centroid.y + Math.sin((currentAngle * Math.PI) / 180) * pointerLen,
              );
              ctx.stroke();

              // Sky-blue predicted pointer
              const decel = estimateDeceleration(dataLog.current);
              const predictedRemaining = predictStoppingAmount(
                peakValueRef.current || currentVelocity,
                Math.abs(decel) || 20,
              );

              if (dataLog.current.length >= 6 && peakValueRef.current > 15) {
                if (frozenPredictedAngleRef.current === null) {
                  frozenPredictedAngleRef.current = normalizeAngle360(currentAngle + predictedRemaining);
                }
              }

              const livePredictedAngle =
                frozenPredictedAngleRef.current !== null
                  ? frozenPredictedAngleRef.current
                  : normalizeAngle360(currentAngle + (predictedRemaining || 45));

              const predLen = 105 * sp;
              ctx.strokeStyle = "#38bdf8";
              ctx.setLineDash([6 * sp, 6 * sp]);
              ctx.lineWidth = 3 * sp;
              ctx.beginPath();
              ctx.moveTo(blob.centroid.x, blob.centroid.y);
              ctx.lineTo(
                blob.centroid.x + Math.cos((livePredictedAngle * Math.PI) / 180) * predLen,
                blob.centroid.y + Math.sin((livePredictedAngle * Math.PI) / 180) * predLen,
              );
              ctx.stroke();
              ctx.setLineDash([]);

              // "PRED" label at end of predicted pointer
              const px = blob.centroid.x + Math.cos((livePredictedAngle * Math.PI) / 180) * (predLen + 14 * sp);
              const py = blob.centroid.y + Math.sin((livePredictedAngle * Math.PI) / 180) * (predLen + 14 * sp);
              ctx.fillStyle = "#38bdf8";
              ctx.font = `bold ${Math.max(8, 10 * sp)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.fillText("PRED", px, py + 4 * sp);
              ctx.textAlign = "start";

              // RPM tag above bounding box
              const rpmVal = degreesPerSecToRPM(currentVelocity);
              const tagH = 22 * sp;
              const tagY = Math.max(tagH, blob.box.minY - 4 * sp);
              ctx.fillStyle = "rgba(0,0,0,0.85)";
              ctx.beginPath();
              ctx.roundRect(blob.box.minX, tagY - tagH, 95 * sp, tagH, 4 * sp);
              ctx.fill();
              ctx.fillStyle = "#facc15";
              ctx.font = `bold ${Math.max(9, 11 * sp)}px sans-serif`;
              ctx.fillText(`⚡ ${rpmVal.toFixed(0)} RPM`, blob.box.minX + 6 * sp, tagY - 5 * sp);
            }
          }

          // ── STATE MACHINE ───────────────────────────────────────────────
          const isSpin = modeRef.current === "spin";

          if (statusRef.current === "ready") {
            if (isSpin) {
              // Spin mode: start tracking as soon as calibrated & blob visible
              if (targetColorRef.current !== null) {
                setStatus("tracking");
                dataLog.current = [];
                peakValueRef.current = 0;
                stopDwellFrames.current = 0;
                experimentStartTimeRef.current = now;
                startCentroidRef.current = { ...blob.centroid };
              }
            } else {
              // Push mode: start tracking on movement
              if (currentVelocity > 15) {
                setStatus("tracking");
                dataLog.current = [];
                peakValueRef.current = 0;
                stopDwellFrames.current = 0;
                experimentStartTimeRef.current = now;
                startCentroidRef.current = { ...blob.centroid };
              }
            }
          }

          if (statusRef.current === "tracking" || statusRef.current === "predicting") {
            if (blobFoundRef.current && currentVelocity > 0) {
              dataLog.current.push({ t: now / 1000, v: currentVelocity });
              if (dataLog.current.length > 60) dataLog.current.shift();
            }

            if (currentVelocity > peakValueRef.current) {
              peakValueRef.current = currentVelocity;
            }

            const elapsedSec = experimentStartTimeRef.current
              ? (now - experimentStartTimeRef.current) / 1000
              : 0;

            // Spin: strictly 8-second window
            const isTimeout = isSpin && elapsedSec >= 8.0;

            // Push: early stop on sustained low velocity
            let isEarlyStop = false;
            if (!isSpin) {
              if (currentVelocity < 6 && peakValueRef.current > 18) {
                stopDwellFrames.current++;
                if (stopDwellFrames.current >= 20) isEarlyStop = true;
              } else {
                stopDwellFrames.current = 0;
              }
            }

            if (isTimeout || isEarlyStop) {
              const peak = isSpin
                ? degreesPerSecToRPM(peakValueRef.current)
                : peakValueRef.current;
              const decel = estimateDeceleration(dataLog.current);
              const stoppingAmount = predictStoppingAmount(
                peakValueRef.current,
                Math.abs(decel) || 1,
              );

              let predicted: number;
              let actual: number;
              let error: number;
              let accuracy: number;
              let isFailed = false;
              let failureReason: string | undefined;

              if (isSpin) {
                const actualFacing = normalizeAngle360(unwrappedAngleRef.current);
                actual = actualFacing;

                if (frozenPredictedAngleRef.current !== null) {
                  predicted = frozenPredictedAngleRef.current;
                } else {
                  predicted = normalizeAngle360(actualFacing + stoppingAmount);
                }

                // Check for real rotation
                if (peak < 3) {
                  isFailed = true;
                  failureReason = "No significant rotation detected. Make sure to give the tuber a solid spin!";
                  error = 180;
                  accuracy = 0;
                } else {
                  error = calculateCircularError(predicted, actual);
                  accuracy = calculateAccuracyFromError(error);
                }

                // Render end-of-run success/miss indicator directly on canvas
                const isHit = error <= 35 && !isFailed;
                ctx.fillStyle = isHit ? "#4ade80" : "#f472b6";
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 3 * sp;
                ctx.beginPath();
                ctx.roundRect(W / 2 - 130 * sp, 18 * sp, 260 * sp, 40 * sp, 20 * sp);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = "#000000";
                ctx.font = `bold ${Math.max(12, 15 * sp)}px sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText(
                  isHit
                    ? `🎯 DIRECT HIT! OFF BY ${error.toFixed(1)}°`
                    : `⚡ MISSED BY ${error.toFixed(1)}°`,
                  W / 2,
                  43 * sp,
                );
                ctx.textAlign = "start";
              } else {
                // Push mode: measured travel distance vs predicted
                const start = startCentroidRef.current;
                const last = lastKnownCentroidRef.current;
                if (start && last) {
                  const dx = last.x - start.x;
                  const dy = last.y - start.y;
                  actual = Math.sqrt(dx * dx + dy * dy);
                } else {
                  actual = stoppingAmount * 0.4;
                }
                predicted = Math.min(260, Math.max(60, stoppingAmount * 0.4));
                error = Math.abs(actual - predicted);
                accuracy = Math.max(0, 100 - (error / Math.max(1, predicted)) * 100);
              }

              const res: ExperimentResult = {
                id: Math.random().toString(36).substring(2, 11),
                timestamp: Date.now(),
                mode: modeRef.current,
                peakValue: Math.round(peak * 10) / 10,
                predictedValue: Math.round(predicted * 10) / 10,
                actualValue: Math.round(actual * 10) / 10,
                error: Math.round(error * 10) / 10,
                accuracyScore: Math.round(accuracy * 10) / 10,
                failed: isFailed,
                failureReason,
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

      // ── Throttled React UI update ──────────────────────────────────────────
      if (now - lastUiUpdateRef.current > 100) {
        const rpm =
          modeRef.current === "spin"
            ? degreesPerSecToRPM(currentVelocity)
            : currentVelocity;
        setLiveRPM(rpm);

        if (experimentStartTimeRef.current && modeRef.current === "spin") {
          const elapsed = (now - experimentStartTimeRef.current) / 1000;
          setTimeLeft(Math.max(0, 8.0 - elapsed));
        }

        lastUiUpdateRef.current = now;
      }
    } catch (err) {
      console.error("Tracking loop error:", err);
    }

    lastTimeRef.current = now;
    rafRef.current = requestAnimationFrame(tick);
  }, [addResult, cleanup]);

  // ── RAF lifecycle ──────────────────────────────────────────────────────────
  useEffect(() => {
    const activeStatuses: ExperimentStatus[] = [
      "calibrating", "ready", "tracking", "predicting", "scanning",
    ];
    if (activeStatuses.includes(status)) {
      lastTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [status, tick]);

  // ── Dashboard view ─────────────────────────────────────────────────────────
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

  // ── Instruction text per state/mode ────────────────────────────────────────
  const getInstruction = (): string | null => {
    if (status === "calibrating") return "Tap your potato on the camera to lock its color";
    if (!calibratedColor && status === "ready") return "Tap CALIBRATE then tap your potato on screen";
    if (calibratedColor && status === "ready" && currentMode === "push")
      return "Shove the potato! Tracking starts on movement.";
    if (calibratedColor && status === "ready" && currentMode === "spin")
      return "Starting 8s tracking window... Spin the spud!";
    if (status === "tracking" && currentMode === "spin") return null;
    if (status === "tracking" && currentMode === "push") return "Keep it rolling!";
    return null;
  };
  const instruction = getInstruction();

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="paper-grain relative flex min-h-screen w-full flex-col items-center justify-center bg-bubblegum p-3 sm:p-8">
      {/* Hashtag pills */}
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

      {/* Main POTATO CAM panel */}
      <div className="relative mx-auto w-full max-w-4xl rounded-3xl border-4 border-foreground bg-cream p-3 sm:p-6 shadow-[10px_10px_0_0_rgba(0,0,0,1)]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b-2 border-foreground/20">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="font-display text-xl sm:text-2xl font-extrabold uppercase text-foreground">
              📷 POTATO CAM
            </span>
            <span className="rounded-full border-2 border-foreground bg-mint px-2.5 py-0.5 text-xs font-extrabold uppercase text-foreground shadow-[1px_1px_0_0_rgba(0,0,0,1)]">
              LIVE
            </span>
          </div>

          {/* Three-Mode Toggle */}
          <div className="flex flex-wrap items-center gap-1 rounded-full border-2 border-foreground bg-card p-1 shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
            <button
              onClick={() => handleSwitchMode("push")}
              className={`rounded-full px-3 py-1.5 font-display text-xs sm:text-sm font-extrabold uppercase transition-colors min-h-[44px] cursor-pointer ${
                currentMode === "push"
                  ? "bg-butter text-foreground border border-foreground shadow-[1px_1px_0_0_rgba(0,0,0,1)]"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Push Mode
            </button>
            <button
              onClick={() => handleSwitchMode("spin")}
              className={`rounded-full px-3 py-1.5 font-display text-xs sm:text-sm font-extrabold uppercase transition-colors min-h-[44px] cursor-pointer ${
                currentMode === "spin"
                  ? "bg-butter text-foreground border border-foreground shadow-[1px_1px_0_0_rgba(0,0,0,1)]"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Spin Mode
            </button>
            <button
              onClick={() => handleSwitchMode("mood")}
              className={`rounded-full px-3 py-1.5 font-display text-xs sm:text-sm font-extrabold uppercase transition-colors min-h-[44px] cursor-pointer ${
                currentMode === "mood"
                  ? "bg-butter text-foreground border border-foreground shadow-[1px_1px_0_0_rgba(0,0,0,1)]"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Mood Potato
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFacingMode((p) => (p === "environment" ? "user" : "environment"))}
              className="flex items-center gap-1.5 rounded-full border-2 border-foreground bg-butter px-3 sm:px-4 py-1.5 font-display text-xs sm:text-sm font-extrabold uppercase shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 cursor-pointer min-h-[44px]"
            >
              ↺ FLIP
            </button>
            <button
              onClick={startCalibrate}
              disabled={status === "tracking" || status === "predicting" || status === "scanning"}
              className="flex items-center gap-1.5 rounded-full border-2 border-foreground bg-sky px-3 sm:px-4 py-1.5 font-display text-xs sm:text-sm font-extrabold uppercase shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 cursor-pointer min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⚙ CALIBRATE
            </button>
            <button
              onClick={() => {
                cleanup();
                onExit(currentMode);
              }}
              className="rounded-full border-2 border-foreground bg-bubblegum px-3 py-1.5 font-display text-xs sm:text-sm font-extrabold uppercase shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 cursor-pointer min-h-[44px]"
            >
              EXIT
            </button>
          </div>
        </div>

        {/* Camera Viewport */}
        <div className="relative mt-4 overflow-hidden rounded-2xl border-4 border-foreground bg-black aspect-[4/3] w-full shadow-inner">
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

          {/* Instruction banner */}
          {instruction && status !== "stopped" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-16 sm:bottom-20 flex justify-center z-10 px-4">
              <div className="rounded-full border-2 border-foreground bg-cream/90 px-4 py-2 font-display text-xs sm:text-sm font-extrabold uppercase text-foreground shadow-[3px_3px_0_0_rgba(0,0,0,1)] animate-pulse text-center">
                {instruction}
              </div>
            </div>
          )}

          {/* Calibration crosshair prompt (center overlay) */}
          {status === "calibrating" && (
            <div className="absolute inset-0 m-auto flex h-20 w-72 sm:w-80 flex-col items-center justify-center rounded-xl border-4 border-foreground bg-cream p-3 shadow-[6px_6px_0_0_rgba(0,0,0,1)] pointer-events-none z-20">
              <p className="text-center font-display text-sm font-extrabold text-foreground animate-pulse">
                🎯 Tap the potato to lock color!
              </p>
            </div>
          )}

          {/* Calibrated color swatch (top-left corner) */}
          {calibratedColor && status !== "calibrating" && (
            <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-10 flex items-center gap-2 rounded-xl border-2 border-foreground bg-cream px-2.5 py-1.5 shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
              <div
                className="h-5 w-5 rounded border-2 border-foreground flex-shrink-0"
                style={{ backgroundColor: `rgb(${calibratedColor.r},${calibratedColor.g},${calibratedColor.b})` }}
              />
              <div className="flex flex-col">
                <span className="font-mono text-[9px] sm:text-[10px] font-extrabold uppercase text-foreground leading-tight">
                  LOCKED HSV
                </span>
                <span className="font-mono text-[8px] sm:text-[9px] text-muted-foreground leading-tight">
                  rgb({calibratedColor.r},{calibratedColor.g},{calibratedColor.b})
                </span>
              </div>
            </div>
          )}

          {/* Mood scanning beam */}
          {status === "scanning" && (
            <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden w-full h-full">
              <div
                className="w-full h-2 bg-leaf shadow-[0_0_24px_6px_rgba(74,222,128,0.9)]"
                style={{ transform: `translateY(${(scanProgress / 100) * 360}px)` }}
              />
            </div>
          )}

          {/* Mood scanning diagnostic overlay */}
          {status === "scanning" && (
            <div className="absolute inset-x-3 sm:inset-x-4 top-4 sm:top-8 z-20 mx-auto max-w-md rounded-2xl border-4 border-foreground bg-cream p-4 sm:p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
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

              <div className="mt-3 space-y-1 font-mono text-[10px] sm:text-[11px] font-bold">
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
                  alt="Nervous mascot"
                  className="h-7 w-7 sm:h-8 sm:w-8 object-contain wobble shrink-0"
                />
                <p className="text-[10px] sm:text-[11px] font-bold text-muted-foreground italic">
                  Subject observed sweating starch... please remain completely still.
                </p>
              </div>
            </div>
          )}

          {/* Camera error */}
          {errorMsg && (
            <div className="absolute inset-0 m-auto flex h-36 w-72 sm:w-80 flex-col items-center justify-center rounded-xl border-4 border-foreground bg-bubblegum p-4 shadow-[8px_8px_0_0_rgba(0,0,0,1)] z-20">
              <p className="text-center font-display text-base font-extrabold text-foreground">Camera Error</p>
              <p className="text-center text-xs font-bold mt-1">{errorMsg}</p>
            </div>
          )}

          {/* Live HUD chip — bottom right */}
          <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 sticker bg-cream px-3 sm:px-4 py-1.5 sm:py-2 border-2 border-foreground shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-10">
            <div className="text-center font-display text-xl sm:text-3xl font-extrabold text-foreground">
              {currentMode === "mood"
                ? status === "scanning"
                  ? `${Math.floor(scanProgress)}%`
                  : status === "stopped"
                    ? (result?.mood ?? "DONE")
                    : "READY"
                : currentMode === "spin"
                  ? `${liveRPM.toFixed(0)}`
                  : `${liveRPM.toFixed(1)}`}
            </div>
            <div className="text-center font-display text-[9px] sm:text-xs font-bold uppercase text-muted-foreground">
              {currentMode === "mood" ? "ANALYSIS" : currentMode === "spin" ? "RPM" : "PX/S"}
            </div>
          </div>

          {/* Countdown timer chip — bottom left (spin tracking only) */}
          {currentMode === "spin" && (status === "tracking" || status === "predicting") && (
            <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 sticker bg-sky px-3 sm:px-4 py-1.5 sm:py-2 border-2 border-foreground shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-10">
              <div className="text-center font-display text-xl sm:text-3xl font-extrabold text-foreground">
                {timeLeft.toFixed(1)}s
              </div>
              <div className="text-center font-display text-[9px] sm:text-xs font-bold uppercase text-muted-foreground">
                TIME LEFT
              </div>
            </div>
          )}

          {/* Results modal */}
          {status === "stopped" && result && showResultModal && (
            <div className="absolute inset-0 z-30 m-auto flex max-w-sm sm:max-w-lg h-max max-h-[95%] overflow-y-auto flex-col rounded-3xl border-4 border-foreground bg-sky p-4 sm:p-6 shadow-[10px_10px_0_0_rgba(0,0,0,1)] text-center">
              {/* Header badge + close */}
              <div className="relative flex items-center justify-center">
                <div className="rounded-full border-2 border-foreground bg-bubblegum px-3 sm:px-4 py-1 font-display text-[10px] sm:text-sm font-extrabold uppercase text-foreground shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                  ✨{" "}
                  {currentMode === "spin"
                    ? "PHYSICAL ROTATION HALTED!"
                    : currentMode === "mood"
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

              {result.failed ? (
                <div className="mt-4 rounded-2xl border-2 border-foreground bg-bubblegum p-4 text-center">
                  <h3 className="font-display text-xl font-extrabold text-foreground uppercase">
                    NO ROTATION DETECTED
                  </h3>
                  <p className="mt-2 text-xs font-bold text-foreground/90">
                    {result.failureReason || "The potato didn't rotate enough to track physics. Give it a firm spin!"}
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="mt-3 font-display text-lg sm:text-2xl font-extrabold uppercase leading-tight text-foreground">
                    {currentMode === "mood"
                      ? `OFFICIAL MOOD: ${result.mood}!`
                      : result.accuracyScore > 75
                        ? "💥 ROOT VEGETABLE ACCURACY! NAILED IT!"
                        : "💥 CHAOTIC ROOT VEGETABLE DYNAMICS! Good try!"}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-foreground/85">
                    {currentMode === "mood"
                      ? `"${result.moodExplanation}"`
                      : currentMode === "spin"
                        ? "Here's how our angular telemetry held up against physical reality:"
                        : "The real potato has landed. Here's how our trajectory held up:"}
                  </p>

                  {/* Two metric boxes */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl border-2 border-foreground bg-card p-3 text-center shadow-[3px_3px_0_0_rgba(0,0,0,1)]">
                      <div className="font-display text-[10px] sm:text-xs font-extrabold uppercase text-bubblegum">
                        {currentMode === "mood" ? "STARCH SPECTRUM" : "HOW WRONG WERE WE?"}
                      </div>
                      <div className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                        {currentMode === "mood"
                          ? "99.4%"
                          : `${result.error.toFixed(1)} ${currentMode === "spin" ? "°" : "px"}`}
                      </div>
                      <div className="mt-1 font-mono text-[9px] sm:text-xs font-bold text-muted-foreground">
                        {currentMode === "mood"
                          ? "EPIDERMIS SCAN OK"
                          : currentMode === "spin"
                            ? `PRED ${result.predictedValue.toFixed(0)}° vs ACTUAL ${result.actualValue.toFixed(0)}°`
                            : `PRED ${Math.round(result.predictedValue)}px vs ACTUAL ${Math.round(result.actualValue)}px`}
                      </div>
                    </div>

                    <div className="rounded-2xl border-2 border-foreground bg-card p-3 text-center shadow-[3px_3px_0_0_rgba(0,0,0,1)]">
                      <div className="font-display text-[10px] sm:text-xs font-extrabold uppercase text-butter">
                        {currentMode === "mood" ? "MEASURED MOOD" : "PREDICTION ACCURACY"}
                      </div>
                      <div className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                        {currentMode === "mood" ? result.mood : `${result.accuracyScore.toFixed(1)}%`}
                      </div>
                      <div className="mt-1 font-mono text-[9px] sm:text-xs font-bold text-muted-foreground">
                        {currentMode === "mood"
                          ? "POTATO COUNCIL CERTIFIED"
                          : currentMode === "spin"
                            ? `PEAK: ${result.peakValue.toFixed(0)} RPM`
                            : `PEAK: ${result.peakValue.toFixed(1)} px/s`}
                      </div>
                    </div>
                  </div>

                  {/* Telemetry strip */}
                  <div className="mt-3 rounded-xl border-2 border-foreground bg-cream p-3 text-left font-mono text-[9px] sm:text-xs font-bold text-foreground space-y-1 shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                    <div className="flex justify-between gap-2">
                      <span className="shrink-0">
                        {currentMode === "spin"
                          ? "SPIN DYNAMICS:"
                          : currentMode === "mood"
                            ? "ORGANIC TENSION:"
                            : "LINEAR VELOCITY:"}
                      </span>
                      <span className="text-right">
                        {currentMode === "spin"
                          ? `${result.peakValue.toFixed(0)} PEAK RPM`
                          : currentMode === "mood"
                            ? "99.4% STARCH EQUILIBRIUM"
                            : `${result.peakValue.toFixed(1)} PX/S PEAK`}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="shrink-0">MISS BY:</span>
                      <span className="text-right">
                        {currentMode === "spin"
                          ? `${result.error.toFixed(1)}° (${result.accuracyScore.toFixed(0)}% accuracy)`
                          : currentMode === "mood"
                            ? "N/A"
                            : `${result.error.toFixed(1)}px`}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="shrink-0">TIMESTAMP:</span>
                      <span className="text-right">{new Date(result.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={handleRestart}
                  className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-foreground bg-butter py-3 font-display text-xs sm:text-sm font-extrabold uppercase shadow-[3px_3px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 cursor-pointer min-h-[44px]"
                >
                  ↺{" "}
                  {currentMode === "spin"
                    ? "SPIN ANOTHER! 🥔"
                    : currentMode === "mood"
                      ? "SCAN ANOTHER! 🥔"
                      : "TOSS ANOTHER! 🥔"}
                </button>
                <button
                  onClick={() => setShowResultModal(false)}
                  className="rounded-xl border-2 border-foreground bg-cream py-3 font-display text-xs sm:text-sm font-extrabold uppercase shadow-[3px_3px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 cursor-pointer min-h-[44px]"
                >
                  INSPECT FROZEN FRAME
                </button>
              </div>
            </div>
          )}

          {/* Floating bar when result modal dismissed */}
          {status === "stopped" && result && !showResultModal && (
            <div className="absolute bottom-4 inset-x-0 mx-auto flex w-max max-w-[95%] flex-wrap items-center justify-center gap-2 rounded-full border-2 border-foreground bg-cream px-4 py-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)] z-20">
              <span className="font-display text-xs font-extrabold uppercase text-foreground">
                Frame Frozen
              </span>
              <button
                onClick={() => setShowResultModal(true)}
                className="rounded-full border border-foreground bg-sky px-3 py-1 font-display text-xs font-extrabold uppercase hover:bg-butter cursor-pointer min-h-[44px]"
              >
                Reopen Stats
              </button>
              <button
                onClick={handleRestart}
                className="rounded-full border border-foreground bg-leaf px-3 py-1 font-display text-xs font-extrabold uppercase hover:bg-butter cursor-pointer min-h-[44px]"
              >
                Run Another
              </button>
              <button
                onClick={() => setShowDashboard(true)}
                className="rounded-full border border-foreground bg-butter px-3 py-1 font-display text-xs font-extrabold uppercase hover:bg-mint cursor-pointer min-h-[44px]"
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
