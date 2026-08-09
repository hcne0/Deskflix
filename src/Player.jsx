import { useState, useEffect, useRef } from 'react';

export default function Player({ mediaPath, duration, initialTime, onClose }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);

  // Time-Shift Streaming States
  const safeStart = initialTime ? Math.floor(initialTime) : 0;
  const [seekOffset, setSeekOffset] = useState(safeStart);
  const [isBuffering, setIsBuffering] = useState(true);
  const [streamUrl, setStreamUrl] = useState(`http://localhost:8888/stream?path=${encodeURIComponent(mediaPath)}&start=${safeStart}`);

  // UI States
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(safeStart);
  // Prevent division by zero if duration is missing
  const safeDuration = duration > 0 ? duration : 7200; 
  const [progress, setProgress] = useState((safeStart / safeDuration) * 100);
  
  // Custom Features
  const [volume, setVolume] = useState(1); 
  const [brightness, setBrightness] = useState(100); 
  const [aspectMode, setAspectMode] = useState('contain'); 
  
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);

  // --- THE TIME-SHIFT ENGINE ---
  // Tells the FFmpeg backend to instantly restart at the requested second
  const jumpToTime = (targetTimeInSeconds) => {
    const safeTime = Math.max(0, Math.min(targetTimeInSeconds, safeDuration - 5));
    setIsBuffering(true);
    setSeekOffset(safeTime);
    setCurrentTime(safeTime);
    setProgress((safeTime / safeDuration) * 100);
    setStreamUrl(`http://localhost:8888/stream?path=${encodeURIComponent(mediaPath)}&start=${Math.floor(safeTime)}`);
  };

  const skipForward = (e) => { e.stopPropagation(); jumpToTime(currentTime + 10); };
  const skipBackward = (e) => { e.stopPropagation(); jumpToTime(currentTime - 10); };

  const handleSeekDrag = (e) => {
    const newPercent = parseFloat(e.target.value);
    setProgress(newPercent);
    setCurrentTime((newPercent / 100) * safeDuration);
  };

  const handleSeekCommit = (e) => {
    jumpToTime((parseFloat(e.target.value) / 100) * safeDuration);
  };

  // --- PROGRESS TRACKING ---
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    // Add the video's internal clock to our offset to get the TRUE time
    const actualTime = seekOffset + videoRef.current.currentTime;
    setCurrentTime(actualTime);
    setProgress((actualTime / safeDuration) * 100);
    setIsBuffering(false);

    // Save progress to your backend silently every 5 seconds
    if (Math.floor(actualTime) % 5 === 0 && window.electronApi && window.electronApi.saveProgress) {
        window.electronApi.saveProgress({ path: mediaPath, time: actualTime, length: safeDuration });
    }
  };

  // --- 200% AUDIO OVERDRIVE ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const initAudio = () => {
      if (!audioCtxRef.current) {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioCtx.createMediaElementSource(video);
          const gainNode = audioCtx.createGain();
          source.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          audioCtxRef.current = audioCtx;
          gainNodeRef.current = gainNode;
          gainNode.gain.value = volume;
        } catch (e) { console.error("Audio Routing Error", e); }
      }
    };
    video.addEventListener('play', initAudio, { once: true });
    return () => video.removeEventListener('play', initAudio);
  }, []);

  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = volume;
  }, [volume]);

  // --- UI CONTROLS ---
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [isPlaying]);

  const togglePlay = () => {
    if (videoRef.current.paused) { videoRef.current.play(); setIsPlaying(true); } 
    else { videoRef.current.pause(); setIsPlaying(false); setShowControls(true); }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) containerRef.current.requestFullscreen();
    else document.exitFullscreen();
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black overflow-hidden flex items-center justify-center font-sans animate-in fade-in duration-500 selection:bg-transparent"
      onMouseMove={handleMouseMove}
      onClick={togglePlay}
      onDoubleClick={toggleFullScreen}
    >
      {/* Loading Spinner */}
      {isBuffering && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <svg className="w-16 h-16 text-red-600 animate-spin opacity-80" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        </div>
      )}

      {/* Invisible Double-Tap Zones for 10s Skip */}
      <div className="absolute left-0 top-0 w-1/4 h-full z-20 cursor-pointer" onDoubleClick={skipBackward} />
      <div className="absolute right-0 top-0 w-1/4 h-full z-20 cursor-pointer" onDoubleClick={skipForward} />

      {/* THE ACTUAL VIDEO ELEMENT */}
      <video
        ref={videoRef}
        src={streamUrl}
        autoPlay
        onTimeUpdate={handleTimeUpdate}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onEnded={onClose}
        style={{ objectFit: aspectMode, filter: `brightness(${brightness}%)` }}
        className="w-full h-full pointer-events-none"
      />

      {/* TOP GRADIENT BAR */}
      <div className={`absolute top-0 left-0 w-full px-6 pt-6 pb-20 bg-gradient-to-b from-black/90 via-black/40 to-transparent transition-opacity duration-500 z-30 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-white hover:text-white/70 transition-colors flex items-center gap-3 text-2xl font-semibold drop-shadow-xl pointer-events-auto">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
      </div>

      {/* BOTTOM NETFLIX CONTROL BAR */}
      <div className={`absolute bottom-0 left-0 w-full px-8 pb-8 pt-32 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-500 flex flex-col gap-2 z-30 pointer-events-auto ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} onClick={(e) => e.stopPropagation()}>
        
        {/* Seek Bar */}
        <div className="w-full group cursor-pointer relative flex items-center h-6 mb-2">
          <input 
            type="range" min="0" max="100" step="0.1"
            value={progress} 
            onChange={handleSeekDrag}
            onMouseUp={handleSeekCommit}
            onTouchEnd={handleSeekCommit}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-40"
          />
          <div className="w-full h-[4px] bg-white/30 rounded-full group-hover:h-[6px] transition-all relative">
            <div className="absolute top-0 left-0 h-full bg-red-600 rounded-full pointer-events-none" style={{ width: `${progress}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-red-600 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ left: `calc(${progress}% - 8px)` }} />
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-6">
            
            <button onClick={togglePlay} className="hover:scale-110 transition-transform">
              {isPlaying ? <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
            </button>

            {/* Skip Backward 10s */}
            <button onClick={skipBackward} className="hover:text-white/70 transition-colors hidden md:block">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" /></svg>
            </button>
            
            {/* Skip Forward 10s */}
            <button onClick={skipForward} className="hover:text-white/70 transition-colors hidden md:block">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" /></svg>
            </button>
            
            {/* 200% Volume */}
            <div className="flex items-center gap-3 group relative">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z" /></svg>
              <div className="w-0 overflow-hidden group-hover:w-28 transition-all duration-300 ease-out flex items-center">
                <input type="range" min="0" max="2" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-24 accent-white h-1 bg-white/20 appearance-none rounded-full" />
              </div>
            </div>

            <span className="text-sm font-semibold tracking-wide ml-2">
              {formatTime(currentTime)} <span className="text-white/40 mx-1">/</span> {formatTime(safeDuration)}
            </span>
          </div>

          <div className="flex items-center gap-6">
            
            {/* Brightness Menu */}
            <div className="relative group">
              <button className="hover:text-white/70 transition-colors"><svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg></button>
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-[#181818] border border-zinc-800 p-4 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity shadow-2xl flex flex-col items-center gap-3">
                <span className="text-xs font-bold text-white/50 uppercase">Brightness</span>
                <input type="range" min="50" max="150" step="5" value={brightness} onChange={(e) => setBrightness(e.target.value)} className="w-24 accent-white h-1 bg-white/20 appearance-none rounded-full" />
              </div>
            </div>

            <button onClick={toggleAspect} className="hover:text-white/70 transition-colors"><svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l5-5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></button>
            <button onClick={toggleFullScreen} className="hover:text-white/70 transition-colors"><svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l5-5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></button>
          </div>
        </div>
      </div>
    </div>
  );
}