const http = require('http');
const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const axios = require('axios');

let mainWindow = null; 

// --- 1. THE SINGLE INSTANCE LOCK ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

const TMDB_API_KEY = '12e4beb943ecf29335e21b9663b545bb'; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const vlcPassword = 'secret';
const vlcPort = 8080;
const storeFileName = 'continue-watching.json';
const tmdbCacheFileName = 'tmdb-cache.json';

let vlcProcess = null;
let progressPoller = null;
let currentMediaPath = null;
let tmdbCache = null;

// --- OFFLINE CACHE SYSTEM ---
async function loadTmdbCache() {
  if (tmdbCache) return tmdbCache;
  const cachePath = path.join(app.getPath('userData'), tmdbCacheFileName);
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    tmdbCache = JSON.parse(raw);
  } catch { tmdbCache = {}; }
  return tmdbCache;
}

function saveTmdbCache() {
  if (!tmdbCache) return;
  const cachePath = path.join(app.getPath('userData'), tmdbCacheFileName);
  fs.writeFile(cachePath, JSON.stringify(tmdbCache), 'utf-8').catch(() => {});
}

async function tmdbRequest(endpoint) {
  if (!TMDB_API_KEY) return null;
  const cache = await loadTmdbCache();
  if (cache[endpoint]) return cache[endpoint];

  const url = `${TMDB_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`;
  try {
    const res = await axios.get(url);
    await new Promise(r => setTimeout(r, 250)); 
    cache[endpoint] = res.data;
    saveTmdbCache();
    return res.data;
  } catch (e) {
    if (e.response && e.response.status === 429) {
      await new Promise(r => setTimeout(r, 2500));
      try {
        const retry = await axios.get(url);
        cache[endpoint] = retry.data;
        saveTmdbCache();
        return retry.data;
      } catch(err) { return null; }
    }
    return null;
  }
}

async function fetchTMDB(query, type = 'movie') {
  const data = await tmdbRequest(`/search/${type}?query=${encodeURIComponent(query)}`);
  return data?.results?.[0] || null;
}

// --- STRING CLEANING HELPERS ---
function cleanTitleForTMDB(rawName) {
  let clean = rawName
    .replace(/\./g, ' ') 
    .replace(/\[.*?\]|\(.*?\)/g, '') 
    .replace(/\b(19\d{2}|20\d{2})\b/g, '') 
    .replace(/\b(1080p|720p|2160p|4k|x264|x265|hevc|bluray|brrip|web-dl|w3b-dl|nf|10bit|10b!t|hdr|dv|ddp|dd\s*5\s*1|dd\s*2\s*0|5\s*1|7\s*1|hindi|english|dual\s*audio|esub|esubs|aka|ms)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ') 
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.toLowerCase().includes(' aka ')) clean = clean.split(/ aka /i)[0];
  return clean;
}

function formatSeasonName(rawName) {
  const match = rawName.match(/S(\d+)/i);
  return match ? `Season ${parseInt(match[1], 10)}` : rawName;
}

// --- DATA STORE HELPERS ---
async function ensureStoreFile() {
  const storePath = path.join(app.getPath('userData'), storeFileName);
  try { await fs.access(storePath); } 
  catch { await fs.writeFile(storePath, JSON.stringify({ continueWatching: [], libraries: [], permanentProgress: {} }, null, 2), 'utf-8'); }
  return storePath;
}

async function loadStore() {
  const p = await ensureStoreFile();
  const raw = await fs.readFile(p, 'utf-8');
  const store = JSON.parse(raw);
  if (!store.permanentProgress) store.permanentProgress = {}; 
  if (!store.libraries) store.libraries = [];
  return store;
}

async function saveStore(store) {
  const p = await ensureStoreFile();
  await fs.writeFile(p, JSON.stringify(store, null, 2), 'utf-8');
}

function isVideoFile(fileName) {
  return /\.(mp4|mkv|avi|mov|wmv|flv|webm)$/i.test(fileName);
}

// --- THE MEDIA SCANNER ---
async function scanMediaFolder(baseFolder) {
  const entries = await fs.readdir(baseFolder, { withFileTypes: true });
  const movies = [];
  const series = [];

  for (const entry of entries) {
    if (entry.isFile() && isVideoFile(entry.name)) {
      const cleanName = cleanTitleForTMDB(path.parse(entry.name).name);
      const tmdbData = await fetchTMDB(cleanName, 'movie');
      movies.push({
        id: `${entry.name}`, type: 'movie', tmdbId: tmdbData?.id || null, 
        title: cleanName, path: path.join(baseFolder, entry.name),
        poster: tmdbData?.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : null,
        backdrop: tmdbData?.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}` : null,
        overview: tmdbData?.overview || 'No description available.',
      });
    } 
    else if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const showPath = path.join(baseFolder, entry.name);
      const cleanShowName = cleanTitleForTMDB(entry.name);
      const tmdbData = await fetchTMDB(cleanShowName, 'tv');

      try {
        const seasonDirs = await fs.readdir(showPath, { withFileTypes: true });
        const seasons = [];
        for (const seasonDir of seasonDirs) {
          if (!seasonDir.isDirectory()) continue;
          const seasonPath = path.join(showPath, seasonDir.name);
          const sMatch = seasonDir.name.match(/S(\d+)/i);
          const seasonNum = sMatch ? parseInt(sMatch[1], 10) : 1;
          const formattedSeason = `Season ${seasonNum}`;

          let tmdbSeasonData = null;
          if (tmdbData && tmdbData.id) tmdbSeasonData = await tmdbRequest(`/tv/${tmdbData.id}/season/${seasonNum}`);
          
          try {
            const episodeEntries = await fs.readdir(seasonPath, { withFileTypes: true });
            const episodes = [];
            for (const episodeEntry of episodeEntries) {
              if (!episodeEntry.isFile() || !isVideoFile(episodeEntry.name)) continue;
              const epMatch = episodeEntry.name.match(/S\d+E(\d+)/i);
              const epNum = epMatch ? parseInt(epMatch[1], 10) : null;
              
              let episodeLabel = epMatch ? `Episode ${epNum}` : path.parse(episodeEntry.name).name;
              let episodeOverview = 'Play via VLC';
              let episodeThumbnail = null;

              if (tmdbSeasonData && tmdbSeasonData.episodes && epNum) {
                const realEp = tmdbSeasonData.episodes.find(e => e.episode_number === epNum);
                if (realEp) {
                  episodeLabel = `${epNum}. ${realEp.name}`;
                  episodeOverview = realEp.overview || episodeOverview;
                  if (realEp.still_path) episodeThumbnail = `https://image.tmdb.org/t/p/w500${realEp.still_path}`;
                }
              }
              episodes.push({
                id: `${entry.name}-${seasonDir.name}-${episodeEntry.name}`, type: 'episode',
                show: cleanShowName, season: formattedSeason,
                title: episodeLabel, overview: episodeOverview, thumbnail: episodeThumbnail,
                path: path.join(seasonPath, episodeEntry.name),
              });
            }
            if (episodes.length > 0) seasons.push({ title: formattedSeason, episodes });
          } catch (err) {}
        }
        if (seasons.length > 0) {
          series.push({
            type: 'series', tmdbId: tmdbData?.id || null, title: cleanShowName,
            poster: tmdbData?.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : null,
            backdrop: tmdbData?.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}` : null,
            overview: tmdbData?.overview || 'No description available.', seasons,
          });
        }
      } catch (err) {}
    }
  }
  return { movies, series };
}

// --- VLC PLAYBACK ---
async function fetchVlcStatus() {
  if (!vlcProcess) throw new Error('VLC is not running');
  const url = `http://127.0.0.1:${vlcPort}/requests/status.json`;
  const res = await axios.get(url, { auth: { username: '', password: vlcPassword }, timeout: 3000 });
  return res.data;
}

async function pollVlcPlayback(mediaPath) {
  const status = await fetchVlcStatus();
  const time = Number(status.time || 0);
  const length = Number(status.length || 0);
  const progress = length > 0 ? Math.round((time / length) * 100) : 0;
  
  const store = await loadStore();
  const record = { path: mediaPath, title: path.parse(mediaPath).name, time, length, progress, updatedAt: new Date().toISOString() };
  
  store.permanentProgress[mediaPath] = { time, progress };
  store.continueWatching = store.continueWatching.filter(i => i.path !== mediaPath);
  
  if (progress > 2 && progress < 98) {
    store.continueWatching.unshift(record);
  }

  store.continueWatching = store.continueWatching.slice(0, 50);
  await saveStore(store);
  return record;
}

function getVlcExecutablePath() {
  const platform = process.platform;
  if (platform === 'win32') return 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe';
  if (platform === 'darwin') return '/Applications/VLC.app/Contents/MacOS/VLC';
  return 'vlc'; 
}

async function launchVlcWithHttp(mediaPath, startTime = 0) {
  if (vlcProcess) { try { vlcProcess.kill(); } catch (e) {} vlcProcess = null; }
  const args = ['--no-one-instance', '--intf', 'http', '--http-host', '127.0.0.1', '--http-port', `${vlcPort}`, '--http-password', vlcPassword, '--extraintf', 'qt', '--no-video-title-show', '--play-and-exit'];
  
  if (startTime > 0) args.push(`--start-time=${Math.floor(startTime)}`); 
  args.push(mediaPath);
  
  const vlcExe = getVlcExecutablePath();
  vlcProcess = spawn(vlcExe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  
  vlcProcess.on('exit', async () => { 
    if (progressPoller) clearInterval(progressPoller); 
    vlcProcess = null; 
    BrowserWindow.getAllWindows()[0].webContents.send('vlc-closed'); 
  });
  
  await new Promise(r => setTimeout(r, 1200));
  await pollVlcPlayback(mediaPath).catch(() => {});
  progressPoller = setInterval(() => { pollVlcPlayback(mediaPath).catch(() => {}); }, 2000); 
}

// --- WINDOW CREATION & IPC ---
function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(__dirname, '../dist/icon.ico')
    : path.join(__dirname, '../public/icon.ico');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    icon: iconPath, 
    webPreferences: { 
      preload: path.join(__dirname, 'preload.cjs'), 
      contextIsolation: true, 
      nodeIntegration: false,
      webSecurity: false,
      webviewTag: true
    },
  });

  mainWindow.setMenu(null);

  if (!app.isPackaged) { 
    mainWindow.loadURL('http://localhost:5173'); 
  } else { 
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')); 
  }
}

// --- LIBRARY STAGING HANDLERS ---
ipcMain.handle('get-libraries', async () => {
  const store = await loadStore();
  return store.libraries || [];
});

ipcMain.handle('select-library-folder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle('save-libraries', async (_, librariesArray) => {
  const store = await loadStore();
  store.libraries = librariesArray;
  await saveStore(store);
  return true;
});

// The Master Multi-Directory Scanner
ipcMain.handle('scan-all-libraries', async () => {
  const store = await loadStore();
  const libraries = store.libraries || [];
  const masterCatalog = { movies: [], series: [] };
  const seenMovieIds = new Set();
  const seenSeriesIds = new Set();

  for (const folder of libraries) {
    try {
      // Safely calls your existing custom scanner function
      const result = await scanMediaFolder(folder); 
      
      if (result) {
        result.movies.forEach(movie => {
          if (!seenMovieIds.has(movie.tmdbId)) {
            seenMovieIds.add(movie.tmdbId);
            masterCatalog.movies.push(movie);
          }
        });
        result.series.forEach(show => {
          if (!seenSeriesIds.has(show.tmdbId)) {
            seenSeriesIds.add(show.tmdbId);
            masterCatalog.series.push(show);
          }
        });
      }
    } catch (error) {
      console.error(`Failed to scan library folder: ${folder}`, error);
    }
  }
  return masterCatalog;
});

// --- MEDIA PLAYBACK IPCs ---
ipcMain.handle('media:play', async (_, mediaPath) => {
  const store = await loadStore();
  const val = store.permanentProgress[mediaPath];
  const startTime = typeof val === 'object' && val !== null ? val.time : 0; 
  return launchVlcWithHttp(mediaPath, startTime);
});

ipcMain.handle('media:get-progress', async () => loadStore());

ipcMain.handle('store:remove-item', async (_, mediaPath) => {
  const store = await loadStore();
  store.continueWatching = store.continueWatching.filter(i => i.path !== mediaPath);
  await saveStore(store); 
  return store;
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('second-instance', () => {
  dialog.showErrorBox('App Already Open', 'Deskflix is already running. Please close the existing window first.');
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://*.googlevideo.com/*'] },
    (details, callback) => {
      details.requestHeaders['Origin'] = 'https://www.youtube.com';
      details.requestHeaders['Referer'] = 'https://www.youtube.com/';
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    }
  );

  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
    (details, callback) => {
      const responseHeaders = details.responseHeaders;
      delete responseHeaders['X-Frame-Options'];
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['Content-Security-Policy'];
      delete responseHeaders['content-security-policy'];
      callback({ cancel: false, responseHeaders });
    }
  );

  // --- STAGE 2: THE LOCAL FFMPEG STREAMING ENGINE ---
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/stream') {
      const mediaPath = url.searchParams.get('path');
      const startTime = parseFloat(url.searchParams.get('start') || '0');
      
      if (!mediaPath) {
        res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
        return res.end('Bad Request: missing path');
      }

      try {
        // Verify file exists
        await fs.stat(mediaPath);

        // Set proper headers for streaming MP4 (FFmpeg output will be MP4)
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'none',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        });

        // Use FFmpeg to remux the stream
        const ffmpegArgs = [
        '-ss', startTime.toString(),
        '-i', mediaPath,
        '-c:v', 'libx264',        // FORCE H.264 VIDEO SO CHROME CAN READ IT
        '-preset', 'ultrafast',   // Do it instantly without buffering
        '-c:a', 'aac',            // Safe web audio
        '-b:a', '192k',
        '-ac', '2',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov',
        'pipe:1'
      ];

        let ffmpegPath = app.isPackaged 
          ? path.join(process.resourcesPath, 'ffmpeg.exe') 
          : path.join(app.getAppPath(), 'ffmpeg.exe');

        try {
          await fs.access(ffmpegPath);
        } catch (err) {
          // Fallback to system ffmpeg on PATH
          ffmpegPath = 'ffmpeg';
        }

        const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
        ffmpegProcess.stdout.pipe(res);

        ffmpegProcess.stderr.on('data', (data) => {
          // Log FFmpeg debug info
          // console.log(`[FFmpeg] ${data.toString().trim()}`);
        });

        ffmpegProcess.on('error', (err) => {
          console.error('FFmpeg error:', err);
          if (!res.destroyed) {
            res.destroy();
          }
        });

        // Kill FFmpeg if client disconnects
        req.on('close', () => {
          try {
            ffmpegProcess.kill('SIGKILL');
          } catch (e) {}
        });

        res.on('error', () => {
          try {
            ffmpegProcess.kill('SIGKILL');
          } catch (e) {}
        });
      } catch (err) {
        console.error('Stream error:', err);
        if (!res.destroyed) {
          res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
          res.end('File not found');
        }
      }
    }
  });
  server.listen(8888, () => console.log("Engine running on port 8888"));
  // --------------------------------------------------

  // --- PROGRESS SAVING IPC HANDLER ---
  ipcMain.handle('player:save-progress', async (_, { mediaPath, currentTime, duration, progressPercentage }) => {
    try {
      const store = await loadStore();
      
      // Save progress
      store.permanentProgress[mediaPath] = { 
        time: Math.floor(currentTime),
        duration: Math.floor(duration),
        progress: Math.round(progressPercentage)
      };

      // Update continue watching
      const record = { 
        path: mediaPath, 
        title: path.parse(mediaPath).name, 
        time: Math.floor(currentTime),
        length: Math.floor(duration),
        progress: Math.round(progressPercentage),
        updatedAt: new Date().toISOString() 
      };

      store.continueWatching = store.continueWatching.filter(i => i.path !== mediaPath);
      
      // Only add to continue watching if we're between 2% and 98% watched
      if (progressPercentage > 2 && progressPercentage < 98) {
        store.continueWatching.unshift(record);
      }

      store.continueWatching = store.continueWatching.slice(0, 50);
      await saveStore(store);
      
      return { success: true };
    } catch (err) {
      console.error('Error saving progress:', err);
      return { success: false, error: err.message };
    }
  });

  createWindow();
  
  app.on('activate', () => { 
    if (BrowserWindow.getAllWindows().length === 0) createWindow(); 
  });
});