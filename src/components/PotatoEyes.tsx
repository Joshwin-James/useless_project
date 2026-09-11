import { useEffect, useRef, useState } from "react";

type EyeProps = { className?: string };

function Eye({ className }: EyeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const max = r.width * 0.22;
      const pull = Math.min(dist / 260, 1) * max;
      setOffset({ x: (dx / dist) * pull, y: (dy / dist) * pull });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(
        () => {
          setBlink(true);
          setTimeout(() => setBlink(false), 130);
          loop();
        },
        2600 + Math.random() * 3200,
      );
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      ref={ref}
      className={`absolute grid place-items-center rounded-full bg-card ink-border overflow-hidden ${className ?? ""}`}
    >
      <div
        className="h-[46%] w-[46%] rounded-full bg-foreground transition-transform duration-100 ease-out"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div className="mt-[18%] ml-[18%] h-[30%] w-[30%] rounded-full bg-card" />
      </div>
      <div
        className="absolute inset-0 origin-top bg-spud transition-transform duration-100"
        style={{ transform: `scaleY(${blink ? 1 : 0})` }}
      />
    </div>
  );
}

export function PotatoEyes() {
  return (
    <>
      <Eye className="left-[30%] top-[30%] h-[13%] w-[13%]" />
      <Eye className="left-[57%] top-[30%] h-[13%] w-[13%]" />
    </>
  );
}
