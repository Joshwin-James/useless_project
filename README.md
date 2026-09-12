<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />

# 🥔 Potaa.to 

> *Flick it. Spin it. Read its mood. Welcome to the world's first potato physics lab.*

**Live Site:** [potaaa.vercel.app](https://uselessproject-cyan.vercel.app/https://potaaa.vercel.app)

---

## Basic Details

### Team Members
- **Team Lead:** Joshwin James
- **Team Member** Christwin Soy Jose

### Project Description
Potaa.to is an interactive web experiment where you use your phone or laptop camera to track a **real potato** on your desk. It uses browser-native computer vision to detect the potato, track its movement and rotation, and predict where it'll end up — all in real-time, all in the browser.

No servers. No AI APIs. Just pure client-side physics and vision.

### The Problem (that doesn't exist)
Humanity has spent centuries calculating planetary orbits, quantum particle trajectories, and aerodynamic drag coefficients — yet modern science has completely overlooked the empirical physics of a russet potato flicked across an office desk. Potato enthusiasts and armchair physicists have been left without scientific measurement tools to validate their desk-flicking accuracy and rotational RPM.

### The Solution (that nobody asked for)
Potaa.to: a full-featured, zero-latency desktop laboratory engineered specifically for tuber mechanics. By combining real-time camera color calibration, flood-fill blob tracking, asymmetric surface landmark detection, and exponential moving average (EMA) deceleration modeling, Potato Palooza finally brings rigorous quantitative analysis to potato flicking and spinning.

---

## 🎮 Three Modes

### 🫸 Push Mode
Flick your potato across the desk. The app tracks its trajectory, predicts where it'll stop, and scores your flick accuracy. Uses exponential moving average (EMA) deceleration modeling for real-time stopping-point prediction.

### 🌀 Spin Mode  
Give your potato a spin. The app tracks angular velocity (RPM), predicts the final resting angle, and measures rotational deceleration. Features unwrapped angle tracking across the 360°↔0° boundary.

### 😊 Mood Potato
Hold your potato up to the camera. The app scans its surface features and "reads" the potato's mood — from Chill to Chaotic. It's dumb. It's fun. It's a potato.

---

## Technical Details

### Technologies / Stack

| Layer | Tech |
|-------|------|
| **Framework** | [TanStack Start](https://tanstack.com/start) + React 19 |
| **Build System** | Vite 8 + Nitro |
| **Styling** | Tailwind CSS 4 + Radix UI primitives + Lucide Icons |
| **Vision** | Raw HTML5 Canvas API (Color segmentation, HSV blob tracking, centroid calculation) |
| **Physics Engine** | Custom TypeScript engine (EMA deceleration, angle unwrapping, circular error estimation) |
| **Deployment** | Vercel |

---

## Implementation

### Installation

```bash
# Clone the repository
git clone https://github.com/Joshwin-James/useless_project.git
cd useless_project

# Install dependencies
npm install
```

### Run

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 🔬 How It Works

### Computer Vision (`src/lib/vision.ts`)
- **Flood-fill blob detection:** Finds the potato by color in HSV space with adaptive thresholding.
- **Asymmetric feature tracking:** Locates dark spots (eyes, blemishes) on the potato surface to monitor rotational orientation.
- **Elliptical boundary constraints:** Prevents detector drift onto table shadows or background objects.

### Physics Engine (`src/lib/physics.ts`)
- **Angle unwrapping:** Handles continuous rotation across the 360°↔0° boundary without discontinuities.
- **EMA-based deceleration:** Forecasts stopping coordinates in real-time.
- **Circular error calculations:** Modular error computation for orientation targets.
- **Peak RPM & velocity tracking:** Separates translational motion from rotational dynamics.

### Calibration
Before each experiment, tap the potato in the camera feed to calibrate its color. A locked color swatch confirms calibration, allowing the vision system to adapt to any potato variety and lighting condition.

---

## Team Contributions
- **Joshwin James**: physics engine modeling, UI/UX implementation, and deployment.
-**Christwin Soy Jose**: Concept design, computer vision algorithms.

---

Made with ❤️ at TinkerHub Useless Projects

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)
