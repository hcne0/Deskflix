# Deskflix 🎬

Deskflix is an offline-first, cinematic media engine built for Windows. It brings a premium, Netflix-tier user interface to local media libraries, powered by a custom-built Electron and React architecture. 

Instead of relying on clunky external players, Deskflix features a proprietary Node.js + FFmpeg bridging server that processes, remuxes, and streams heavy MKV/HEVC files directly into a custom HTML5 React video player in real-time.

![Deskflix Home Screen](./assets/home-screen.png)

## 🚀 Technical Highlights

* **On-the-Fly Remuxing:** A local HTTP streaming server (`main.cjs`) spawns background `ffmpeg` processes to instantly convert local MKV containers and H.265/HEVC codecs into browser-safe streams with zero CPU buffering.
* **Custom React Video Engine:** Bypasses default browser limitations using a custom Time-Shift seeking engine that utilizes HTTP Range Requests for instant scrubbing across massive video files.
* **Audio Overdrive (Web Audio API):** Routes media audio through an `AudioContext` and `GainNode` pipeline, allowing users to safely boost volume up to 200% directly within the UI.
* **Persistent State Management:** Automatically tracks and saves exact playback timestamps via IPC bridges, populating real-time "Continue Watching" progress bars on the home screen.
* **Cinematic UI/UX:** Built with Tailwind CSS, featuring auto-hiding controls, CSS-filter brightness menus, dynamic aspect ratio toggles, and seamless animations.

![Deskflix Player UI](./assets/player-ui.png)

## 🛠️ Tech Stack

* **Frontend:** React, Tailwind CSS, Vite
* **Backend:** Electron, Node.js (HTTP Server, File System)
* **Media Engine:** FFmpeg (Spawns child processes for stream manipulation)
* **Build Tools:** Electron-Builder

## 📥 Installation

You do not need Node.js or a terminal to run Deskflix. 

1. Go to the [Releases](../../releases) tab on this repository.
2. Download the latest `Deskflix Setup.exe`.
3. Run the installer. Deskflix will automatically install and launch as a standalone desktop application.

## 💻 Running Locally (For Developers)

If you want to clone and modify the source code:

```bash
# Clone the repository
git clone [https://github.com/yourusername/deskflix.git](https://github.com/yourusername/deskflix.git)

# Install dependencies
npm install

# Start the Vite development server and Electron wrapper concurrently
npm run electron:dev

# Package the app into an .exe for distribution
npm run electron:build
