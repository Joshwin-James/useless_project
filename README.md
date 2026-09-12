# 🥔 Potato Palooza — The Spud Science Lab

> *Flick it. Spin it. Read its mood. Welcome to the world's first potato physics lab.*

**Live Site:** [potaaa.vercel.app](https://potaaa.vercel.app)

---

## What Is This?

Potato Palooza is an interactive web experiment where you use your phone or laptop camera to track a **real potato** on your desk. It uses computer vision to detect the potato, track its movement and rotation, and predict where it'll end up — all in real-time, all in the browser.

No servers. No AI APIs. Just pure client-side physics and vision.

---

## 🎮 Three Modes

### 🫸 Push Mode
Flick your potato across the desk. The app tracks its trajectory, predicts where it'll stop, and scores your flick accuracy. Uses exponential moving average (EMA) deceleration modeling for real-time stopping-point prediction.

### 🌀 Spin Mode  
Give your potato a spin. The app tracks angular velocity (RPM), predicts the final resting angle, and measures rotational deceleration. Features unwrapped angle tracking across the 360°↔0° boundary.

### 😊 Mood Potato
Hold your potato up to the camera. The app scans its surface features and "reads" the potato's mood — from Chill to Chaotic. It's dumb. It's fun. It's a potato.

---

## 🔬 How It Works

### Computer Vision (`vision.ts`)
- **Flood-fill blob detection** finds the potato by color in HSV space
- **Asymmetric feature tracking** locates a dark spot (eye, blemish) on the potato surface for rotation tracking
- Elliptical boundary constraints prevent the detector from locking onto background objects

### Physics Engine (`physics.ts`)
- **Angle unwrapping** handles continuous rotation across the 360°→0° wrap
- **EMA-based deceleration estimation** for real-time stopping predictions  
- **Circular error calculation** with proper modular arithmetic
- RPM calculation isolated from translational movement

### Calibration
Before each experiment, tap the potato in the camera feed to calibrate its color. A locked color swatch confirms the calibration. This lets the vision system adapt to any potato, any lighting.

---

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| **Framework** | [TanStack Start](https://tanstack.com/start) + React 19 |
| **Build** | Vite 8 + Nitro |
| **Styling** | Tailwind CSS 4 + Radix UI primitives |
| **Vision** | Raw Canvas API — no ML libraries |
| **Physics** | Custom TypeScript engine |
| **Deployment** | Vercel |

---

## 🚀 Getting Started

```bash
# Clone the repo
git clone https://github.com/Joshwin-James/potato-palooza-ui.git
cd potato-palooza-ui

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser. Grant camera access when prompted.

### Build for Production

```bash
# Build for Vercel
NITRO_PRESET=vercel npm run build

# Or on Windows PowerShell
$env:NITRO_PRESET="vercel"; npm run build
```

---

## 📁 Project Structure

```
src/
├── routes/
│   └── index.tsx          # Landing page with hero, mode toggle, experiment sections
├── components/
│   ├── ExperimentRunner.tsx   # Main experiment UI — camera, overlays, state machine
│   ├── ResultsDashboard.tsx   # Results display with accuracy scores and history
│   └── ui/                    # Radix-based UI primitives (buttons, dialogs, etc.)
├── lib/
│   ├── physics.ts         # Angle math, EMA, deceleration, RPM calculation
│   ├── vision.ts          # Blob detection, feature tracking, color analysis
│   └── experimentState.ts # TypeScript types and state definitions
└── styles/
    └── app.css            # Global styles and animations
```

---

## 🎯 Key Features

- **Real-time computer vision** — no external APIs, runs entirely in-browser
- **Three experiment modes** — Push, Spin, and Mood Potato
- **Tap-to-calibrate** — adapts to any potato under any lighting
- **Mobile-first** — touch targets, responsive canvas, front/back camera toggle
- **Physics predictions** — EMA deceleration modeling with accuracy scoring
- **Potato Archives** — local history of past experiments
- **Retro/webcore aesthetic** — hand-drawn doodles, chunky typography, sticker art

---

## 👥 Credits

Built by [Joshwin James](https://github.com/Joshwin-James) and friends.

Original UI scaffolded with [Lovable](https://lovable.dev). Physics engine, vision system, and experiment modes built from scratch.

---

## 📄 License

MIT — do whatever you want with it. It's a potato.
