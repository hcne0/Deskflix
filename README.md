# Deskflix 🎬

Deskflix is an offline-first, cinematic media engine built for Windows. It brings a premium, Netflix-tier user interface to local media libraries, powered by a custom-built Electron and React architecture. 

Instead of relying on clunky external players, Deskflix features a proprietary Node.js + FFmpeg bridging server that processes, remuxes, and streams heavy MKV/HEVC files directly into a custom HTML5 React video player in real-time.


<img width="2560" height="1410" alt="image" src="https://github.com/user-attachments/assets/889438d0-bfb0-4c61-88d8-acb26e3303d1" />

<img width="2560" height="1410" alt="image" src="https://github.com/user-attachments/assets/84bdb6f2-491a-4c7c-80e8-199190535ff3" />


## 🚀 Technical Highlights

* **On-the-Fly Remuxing:** A local HTTP streaming server (`main.cjs`) spawns background `ffmpeg` processes to instantly convert local MKV containers and H.265/HEVC codecs into browser-safe streams with zero CPU buffering.
* **Custom React Video Engine:** Bypasses default browser limitations using a custom Time-Shift seeking engine that utilizes HTTP Range Requests for instant scrubbing across massive video files.
* **Audio Overdrive (Web Audio API):** Routes media audio through an `AudioContext` and `GainNode` pipeline, allowing users to safely boost volume up to 200% directly within the UI.
* **Persistent State Management:** Automatically tracks and saves exact playback timestamps via IPC bridges, populating real-time "Continue Watching" progress bars on the home screen.
* **Cinematic UI/UX:** Built with Tailwind CSS, featuring auto-hiding controls, CSS-filter brightness menus, dynamic aspect ratio toggles, and seamless animations.

<img width="2560" height="1410" alt="image" src="https://github.com/user-attachments/assets/4306aa3d-29fa-4c46-a221-1e5576507806" />

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


## 🛠️ Known Challenges & Contribution Guide

We welcome pull requests! If you are looking for a complex engineering challenge to tackle, our biggest current roadblock involves the **FFmpeg Local Streaming Engine and Native Browser Seeking.**

### The Problem: The "10-Second Chunk" Illusion
Deskflix currently remuxes MKV/HEVC files on the fly into an H.264 stream that Chromium can read. It does this by spawning a child `ffmpeg` process in Node.js and piping `stdout` directly to the `localhost:8888` HTTP response. 

Because the video is being generated in real-time, the server cannot send a valid `Content-Length` header to the frontend. As a result:
1. The HTML5 `<video>` element treats the file as a "Live Stream".
2. The browser only calculates the duration of the chunks it currently holds in memory (usually 10 to 20 seconds).
3. Native video seeking completely breaks, as the browser doesn't know the file's true length.

### Our Current Workaround
We bypassed the native HTML5 controls entirely. We built a custom React UI (`Player.jsx`) that pulls the *true* duration of the video from our local database. When a user clicks the timeline, the frontend sends a hard reset to the backend (`?start=SECONDS`). The backend kills the current FFmpeg process and spawns a brand new one starting at the requested timestamp using `-ss`. 

While seamless, this is computationally expensive and not a true "scrubbing" experience.

### How You Can Help (The Bounty)
We are looking for a contributor to help implement true **HTTP 206 Partial Content (Range Requests)** for the live FFmpeg stream. 

If you can build a bridge in `main.cjs` that:
1. Intercepts the browser's `Range: bytes=X-Y` header.
2. Accurately translates that byte range into a time offset for FFmpeg.
3. Successfully feeds the chunks back so the Chromium engine recognizes the full duration natively.

...you will have solved the hardest technical debt in this repository! Please open an issue if you'd like to discuss the architecture before submitting a PR.

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
