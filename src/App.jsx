import { useState, useEffect, useRef } from 'react';
import Player from './Player';

const CarouselRow = ({ title, children }) => {
  const rowRef = useRef(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);

  const checkScroll = () => {
    if (!rowRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
    setShowLeft(scrollLeft > 0);
    setShowRight(scrollLeft + clientWidth < scrollWidth - 5);
  };

  useEffect(() => {
    const timeout = setTimeout(checkScroll, 100);
    window.addEventListener('resize', checkScroll);
    return () => { clearTimeout(timeout); window.removeEventListener('resize', checkScroll); };
  }, [children]);

  const scroll = (direction) => {
    if (rowRef.current) {
      const scrollAmount = rowRef.current.clientWidth * 0.75;
      rowRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  if (!children || children.length === 0) return null;

  return (
    <section className="w-full relative group/row">
      <h3 className="text-lg md:text-xl font-medium text-white px-4 md:px-12 mb-2 drop-shadow">{title}</h3>
      <div className="relative">
        {showLeft && (
          <button onClick={() => scroll('left')} className="absolute left-0 top-0 bottom-8 z-40 w-12 bg-black/60 opacity-0 group-hover/row:opacity-100 transition hover:bg-black/90 flex items-center justify-center text-white backdrop-blur-sm">
            <svg className="w-10 h-10 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        <div ref={rowRef} onScroll={checkScroll} className="flex flex-row gap-2 md:gap-4 overflow-x-auto px-4 md:px-12 pb-8 pt-4 hide-scroll">
          {children}
        </div>
        {showRight && (
          <button onClick={() => scroll('right')} className="absolute right-0 top-0 bottom-8 z-40 w-12 bg-black/60 opacity-0 group-hover/row:opacity-100 transition hover:bg-black/90 flex items-center justify-center text-white backdrop-blur-sm">
            <svg className="w-10 h-10 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </button>
        )}
      </div>
    </section>
  );
};

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [continueWatching, setContinueWatching] = useState([]);
  const [permanentProgress, setPermanentProgress] = useState({});
  const [isScanning, setIsScanning] = useState(false);

 const [internalMediaPath, setinternalMediaPath] = useState(null);
  const [playerMediaPath, setPlayerMediaPath] = useState(null);
  const [playerInitialTime, setPlayerInitialTime] = useState(0);
  
  // Library Staging States
  const [savedLibraries, setSavedLibraries] = useState([]); 
  const [stagedLibraries, setStagedLibraries] = useState([]); 
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);

  // UI States
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef(null);
  
  const [heroCarousel, setHeroCarousel] = useState([]);
  const [heroIndex, setHeroIndex] = useState(0);
  
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const [isNavVisible, setIsNavVisible] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const lastScrollY = useRef(0);

  // Startup Load
  useEffect(() => {
    const initApp = async () => {
      if (window.electronApi) {
        fetchProgress();
        const libs = await window.electronApi.getLibraries();
        setSavedLibraries(libs);
        if (libs && libs.length > 0) {
          setIsScanning(true);
          const masterCatalog = await window.electronApi.scanAllLibraries();
          setCatalog(masterCatalog);
          setIsScanning(false);
        } else {
          setCatalog({ movies: [], series: [] });
        }
      }
    };
    initApp();
  }, []);

  // Performance Scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 10);
      
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setIsNavVisible(prev => prev !== false ? false : prev);
      } else {
        setIsNavVisible(prev => prev !== true ? true : prev);
      }
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    if (window.electronApi && window.electronApi.onVlcClosed) {
       window.electronApi.onVlcClosed(() => fetchProgress());
    }
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    document.body.style.overflow = selectedMedia ? 'hidden' : 'auto';
  }, [selectedMedia]);

  useEffect(() => {
    if (!catalog) return;
    let pool = [...catalog.movies, ...catalog.series].filter(item => item.backdrop).sort(() => 0.5 - Math.random());
    if (pool.length === 0) pool = [...catalog.movies, ...catalog.series];
    setHeroCarousel(pool.slice(0, 5));
    setHeroIndex(0);
  }, [catalog]);

  useEffect(() => {
    if (heroCarousel.length === 0) return;
    const timer = setInterval(() => {
      if (searchQuery === "" && !isModalVisible) {
        setHeroIndex(prev => (prev + 1) % heroCarousel.length);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [heroIndex, heroCarousel, searchQuery, isModalVisible]);

  const handleNextHero = () => setHeroIndex(prev => (prev + 1) % heroCarousel.length);
  const handlePrevHero = () => setHeroIndex(prev => (prev - 1 + heroCarousel.length) % heroCarousel.length);

  const fetchProgress = async () => {
    if (window.electronApi && window.electronApi.getContinueWatching) {
      const store = await window.electronApi.getContinueWatching();
      setContinueWatching(store?.continueWatching || []);
      setPermanentProgress(store?.permanentProgress || {});
    }
  };

  // --- STAGED LIBRARY MANAGEMENT ---
  const openLibraryManager = async () => {
    setIsMenuOpen(false);
    if (window.electronApi) {
      const currentLibs = await window.electronApi.getLibraries();
      setStagedLibraries([...currentLibs]); // Clone the array for staging
      setIsLibraryModalOpen(true);
    }
  };

  const handleAddDirectoryToStage = async () => {
    if (window.electronApi) {
      const newPath = await window.electronApi.selectLibraryFolder();
      if (newPath && !stagedLibraries.includes(newPath)) {
        setStagedLibraries(prev => [...prev, newPath]);
      }
    }
  };

  const handleRemoveDirectoryFromStage = (pathToRemove) => {
    setStagedLibraries(prev => prev.filter(p => p !== pathToRemove));
  };

  const handleSaveAndRescan = async () => {
    setIsLibraryModalOpen(false);
    setIsScanning(true);
    if (window.electronApi) {
      await window.electronApi.saveLibraries(stagedLibraries);
      setSavedLibraries([...stagedLibraries]); 
      const masterCatalog = await window.electronApi.scanAllLibraries();
      setCatalog(masterCatalog);
    }
    setIsScanning(false);
  };
  // --------------------------

 

  const handlePlay = async (path) => {
    setinternalMediaPath(path);
  };

  const handlePlayerClose = () => {
    setinternalMediaPath(null);
    // Refresh continue watching to update progress bars
    fetchProgress();
  };

  const handleRemoveProgress = async (e, path) => {
    e.stopPropagation(); 
    if (window.electronApi && window.electronApi.removeContinueWatching) {
      await window.electronApi.removeContinueWatching(path);
      fetchProgress();
    }
  };

  const openModal = (media) => {
    setSelectedMedia(media);
    setTimeout(() => setIsModalVisible(true), 10);
    if (media.type === 'series') {
      let lastWatchedSeason = media.seasons[0];
      let maxProg = 0;
      media.seasons.forEach(s => {
        s.episodes.forEach(e => {
          const val = permanentProgress[e.path];
          const epProg = typeof val === 'number' ? val : (val?.progress || 0);
          if (epProg > maxProg) { maxProg = epProg; lastWatchedSeason = s; }
        });
      });
      setSelectedSeason(lastWatchedSeason);
    }
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setTimeout(() => { setSelectedMedia(null); setSelectedSeason(null); }, 400); 
  };
  
  const getProgress = (item, progDict) => {
    const getVal = (path) => typeof progDict[path] === 'number' ? progDict[path] : (progDict[path]?.progress || 0);
    if (item.type === 'movie') return getVal(item.path);
    let maxProg = 0;
    item.seasons?.forEach(s => s.episodes.forEach(e => {
      const p = getVal(e.path);
      if (p > maxProg) maxProg = p;
    }));
    return maxProg;
  };

  const getResumePathForSeries = (series, progDict) => {
     const getVal = (path) => typeof progDict[path] === 'number' ? progDict[path] : (progDict[path]?.progress || 0);
     let highestProg = 0;
     let bestPath = null;
     series.seasons?.forEach(s => s.episodes.forEach(e => {
       const p = getVal(e.path);
       if (p > highestProg) { highestProg = p; bestPath = e.path; }
     }));
     return bestPath || (series.seasons?.[0]?.episodes?.[0]?.path);
  };

  const getRichItemDetails = (path) => {
    if (!catalog) return null;
    const movie = catalog.movies.find(m => m.path === path);
    if (movie) return { title: movie.title, poster: movie.backdrop || movie.poster, isEpisode: false };
    for (const show of catalog.series) {
      for (const season of show.seasons) {
        const ep = season.episodes.find(e => e.path === path);
        if (ep) {
          return { showTitle: show.title, title: ep.title, poster: ep.thumbnail || show.backdrop || show.poster, isEpisode: true, sNum: season.title.replace(/\D/g, ''), eNum: ep.title.split('.')[0] };
        }
      }
    }
    return null;
  };

  const formatTime = (totalSeconds) => {
    if (!totalSeconds) return '';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getResumeLabel = (item, progDict) => {
    if (!item) return null;
    if (item.type === 'movie') {
      const val = progDict[item.path];
      const time = typeof val === 'number' ? 0 : (val?.time || 0);
      return time > 0 ? formatTime(time) : null;
    }
    let maxProg = 0, bestEp = null, bestSeason = '';
    item.seasons?.forEach(s => s.episodes.forEach(e => {
      const val = progDict[e.path];
      const p = typeof val === 'number' ? val : (val?.progress || 0);
      if (p > maxProg) { maxProg = p; bestEp = e; bestSeason = s.title; }
    }));
    if (maxProg > 0 && bestEp) {
      const time = typeof progDict[bestEp.path] === 'number' ? 0 : (progDict[bestEp.path]?.time || 0);
      const timeStr = time > 0 ? formatTime(time) : '';
      const sNum = bestSeason.replace(/\D/g, '');
      const eNum = bestEp.title.split('.')[0];
      return `S${sNum} E${eNum} ${timeStr}`.trim();
    }
    return null;
  };

  // FULL SCREEN LOADING STATE
  if (isScanning) {
    return (
      <div className="min-h-screen bg-[#141414] p-8 flex flex-col space-y-12 overflow-hidden animate-pulse">
        <div className="w-full h-[65vh] bg-zinc-800/50 rounded-xl"></div>
        <div className="space-y-4">
          <div className="w-48 h-6 bg-zinc-800/50 rounded"></div>
          <div className="flex gap-4"><div className="aspect-[2/3] w-48 bg-zinc-800/50 rounded"></div><div className="aspect-[2/3] w-48 bg-zinc-800/50 rounded"></div><div className="aspect-[2/3] w-48 bg-zinc-800/50 rounded"></div></div>
        </div>
      </div>
    );
  }

  const { movies, series } = catalog || { movies: [], series: [] };
  const currentHero = heroCarousel[heroIndex];

  // SEARCH FILTER LOGIC
  const searchLower = searchQuery.toLowerCase();
  const filteredMovies = movies.filter(m => m.title.toLowerCase().includes(searchLower));
  const filteredSeries = series.filter(s => s.title.toLowerCase().includes(searchLower));
  const isSearching = searchQuery.trim() !== "";

  // ONBOARDING SCREEN (Empty Library)
  if (!catalog || (movies.length === 0 && series.length === 0 && !isSearching)) {
    return (
      <div className="min-h-screen bg-[#141414] text-white flex flex-col items-center justify-center">
        <h1 className="text-5xl font-bold text-red-600 mb-8 tracking-tighter">DESKFLIX</h1>
        <p className="text-zinc-400 mb-8">Your media library is empty.</p>
        <button onClick={openLibraryManager} className="px-8 py-4 bg-red-600 text-white font-bold rounded hover:bg-red-700 transition shadow-lg shadow-red-600/20">
          Manage Libraries
        </button>

        {/* STAGED LIBRARY MANAGER MODAL */}
        {isLibraryModalOpen && (
          <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setIsLibraryModalOpen(false)}>
            <div className="bg-[#181818] border border-zinc-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Manage Libraries</h2>
                <button onClick={() => setIsLibraryModalOpen(false)} className="text-zinc-400 hover:text-white transition">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <div className="p-6 space-y-4 max-h-[50vh] overflow-y-auto">
                {stagedLibraries.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">No directories added yet.</p>
                ) : (
                  stagedLibraries.map(lib => (
                    <div key={lib} className="flex items-center justify-between bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/50">
                      <span className="text-zinc-300 font-mono text-sm truncate mr-4">{lib}</span>
                      <button onClick={() => handleRemoveDirectoryFromStage(lib)} className="text-red-500 hover:text-red-400 p-2 bg-red-500/10 rounded transition flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))
                )}
                <button onClick={handleAddDirectoryToStage} className="w-full py-4 border-2 border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white rounded-lg transition flex items-center justify-center gap-2 font-medium">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg> Add Directory
                </button>
              </div>
              <div className="p-6 border-t border-zinc-800 bg-black/20">
                <button onClick={handleSaveAndRescan} className="w-full py-3 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 transition text-lg">Save & Rescan</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141414] text-[#e5e5e5] font-sans selection:bg-red-600 selection:text-white pb-20 overflow-x-hidden relative">
      
      {/* SMART SCROLLING NAVBAR */}
      <nav className={`fixed w-full z-40 top-0 flex justify-between items-center px-4 md:px-12 py-8 pointer-events-none transition-transform duration-500 bg-gradient-to-b from-black/90 via-black/30 to-transparent ${isNavVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <h1 className="text-2xl md:text-3xl font-bold text-red-600 tracking-tighter cursor-default drop-shadow-2xl pointer-events-auto">DESKFLIX</h1>
        
        <div className="flex items-center gap-4 md:gap-6 relative pointer-events-auto">
          {/* Transparent Click-Away Search */}
          <div ref={searchRef} className="flex items-center rounded-full px-2 py-1 bg-black/20 backdrop-blur-sm border border-transparent focus-within:border-white/20 transition-all">
            <button onClick={() => { setIsSearchOpen(!isSearchOpen); if (isSearchOpen) setSearchQuery(""); }} className="p-2 text-white hover:text-red-500 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </button>
            {isSearchOpen && (
              <input 
                type="text" 
                autoFocus 
                placeholder="Titles, series, movies..." 
                className="bg-transparent text-white text-base font-medium outline-none px-2 w-48 md:w-64 placeholder:text-white/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            )}
          </div>

          {/* Library Manager Menu */}
          <div className="relative">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-white hover:text-red-500 transition-colors drop-shadow-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
            
            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsMenuOpen(false)}></div>
                <div className="absolute right-0 mt-4 w-56 bg-[#181818]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <button onClick={openLibraryManager} className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-white/10 transition font-medium flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                    Manage Libraries
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* STAGED LIBRARY MANAGER MODAL */}
      {isLibraryModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setIsLibraryModalOpen(false)}>
          <div className="bg-[#181818] border border-zinc-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Manage Libraries</h2>
              <button onClick={() => setIsLibraryModalOpen(false)} className="text-zinc-400 hover:text-white transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[50vh] overflow-y-auto">
              {stagedLibraries.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No directories added yet.</p>
              ) : (
                stagedLibraries.map(lib => (
                  <div key={lib} className="flex items-center justify-between bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/50">
                    <span className="text-zinc-300 font-mono text-sm truncate mr-4">{lib}</span>
                    <button onClick={() => handleRemoveDirectoryFromStage(lib)} className="text-red-500 hover:text-red-400 p-2 bg-red-500/10 rounded transition flex-shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))
              )}
              <button onClick={handleAddDirectoryToStage} className="w-full py-4 border-2 border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white rounded-lg transition flex items-center justify-center gap-2 font-medium">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                Add Directory
              </button>
            </div>
            <div className="p-6 border-t border-zinc-800 bg-black/20">
              <button onClick={handleSaveAndRescan} className="w-full py-3 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 transition text-lg">
                Save & Rescan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DYNAMIC STATIC HERO SECTION */}
      {currentHero && !isSearching && (
        <div className="relative w-full h-[65vh] md:h-[85vh] bg-[#141414] overflow-hidden group">
          <img key={currentHero.title} src={currentHero.backdrop || currentHero.poster} alt={currentHero.title} className="w-full h-full object-cover opacity-0 anim-hero" />
          
          <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/70 to-transparent w-full md:w-[75%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#141414]/60 via-transparent to-transparent" />
          
          <button onClick={handlePrevHero} className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/30 hover:bg-black/80 text-white rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-auto border border-white/10 shadow-xl">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={handleNextHero} className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/30 hover:bg-black/80 text-white rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-auto border border-white/10 shadow-xl">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>

          <div className="absolute bottom-[10%] left-4 md:left-14 max-w-2xl z-10 flex flex-col justify-end pointer-events-none">
            <h2 className="text-5xl md:text-7xl font-bold text-white mb-4 drop-shadow-2xl">{currentHero.title}</h2>
            <p className="text-sm md:text-lg text-gray-300 mb-6 line-clamp-3 md:line-clamp-4 drop-shadow-md">{currentHero.overview}</p>
            <div className="flex items-center gap-4">
              <button onClick={() => openModal(currentHero)} className="flex items-center gap-2 px-6 py-2 md:py-3 bg-white text-black font-bold rounded md:text-xl hover:bg-white/80 transition shadow-lg pointer-events-auto">
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Play
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAROUSELS */}
      <div className="relative z-10 w-full flex flex-col space-y-8 md:space-y-12 pb-12 transition-all duration-500" style={{ marginTop: (!isSearching && currentHero) ? '-5rem' : '7rem' }}>
        
        {!isSearching && continueWatching.length > 0 && (
          <CarouselRow title="Continue Watching">
              {continueWatching.map((item) => {
                const richData = getRichItemDetails(item.path);
                const displayTitle = richData?.title || item.title;
                const displayPoster = richData?.poster;
                
                return (
                  <div key={item.path} className="relative group aspect-video w-64 md:w-72 flex-shrink-0 cursor-pointer rounded-md overflow-hidden bg-zinc-800 transition-transform hover:scale-105 hover:z-40 hover:shadow-xl" onClick={() => handlePlay(item.path)}>
                    <button onClick={(e) => handleRemoveProgress(e, item.path)} className="absolute top-2 right-2 z-30 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-black transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    {displayPoster ? <img src={displayPoster} alt={displayTitle} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" /> : <div className="w-full h-full bg-zinc-700 flex items-center justify-center p-4"><h4 className="text-center font-bold text-white line-clamp-2 drop-shadow-md">{displayTitle}</h4></div>}
                    
                    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/90" />
                    
                    <div className="absolute top-3 left-3 right-3 z-20 pointer-events-none max-w-xs">
                      {richData?.isEpisode ? (
                        <>
                          <p className="text-[10px] md:text-xs font-bold text-red-500 uppercase tracking-wider drop-shadow-md line-clamp-1">{richData.showTitle}</p>
                          <h4 className="text-sm md:text-base font-bold text-white line-clamp-1 drop-shadow-md">{richData.title}</h4>
                        </>
                      ) : (
                        <h4 className="text-sm md:text-base font-bold text-white line-clamp-2 drop-shadow-md">{displayTitle}</h4>
                      )}
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-20 pointer-events-none"><svg className="w-12 h-12 text-white border-2 border-white rounded-full p-2 bg-black/50" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></div>
                    
                    <div className="absolute bottom-2 left-2 right-2 text-white text-[11px] md:text-xs font-extrabold opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] tracking-wide">
                      {richData?.isEpisode ? `S${richData.sNum} E${richData.eNum} ${formatTime(item.time)}` : formatTime(item.time)}
                    </div>
                    <div className="absolute bottom-0 left-0 h-1 bg-zinc-600 w-full z-30"><div className="h-full bg-red-600" style={{ width: `${item.progress}%` }} /></div>
                  </div>
                )
              })}
          </CarouselRow>
        )}

        {filteredMovies.length > 0 && (
          <CarouselRow title={isSearching ? "Movies Matches" : "Movies"}>
              {filteredMovies.map((movie) => {
                const progress = getProgress(movie, permanentProgress);
                return (
                <div key={movie.id} className="relative group aspect-[2/3] w-36 md:w-48 flex-shrink-0 cursor-pointer rounded-md overflow-hidden bg-zinc-800 transition-transform duration-300 delay-150 hover:scale-110 hover:z-40 hover:shadow-2xl" onClick={() => openModal(movie)}>
                  {movie.poster ? <img src={movie.poster} alt={movie.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center p-4 text-center font-medium">{movie.title}</div>}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition"><svg className="w-8 h-8 text-white drop-shadow-md" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"></path></svg></div>
                  
                  {getResumeLabel(movie, permanentProgress) && (
                    <div className="absolute bottom-2 left-2 right-2 text-white text-[11px] md:text-xs font-extrabold opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] tracking-wide">
                      {getResumeLabel(movie, permanentProgress)}
                    </div>
                  )}
                  {progress > 0 && <div className="absolute bottom-0 left-0 h-[4px] bg-zinc-600 w-full z-10"><div className="h-full bg-red-600" style={{ width: `${progress}%` }} /></div>}
                </div>
              )})}
          </CarouselRow>
        )}

        {filteredSeries.length > 0 && (
          <CarouselRow title={isSearching ? "TV Show Matches" : "TV Shows"}>
              {filteredSeries.map((show) => {
                const progress = getProgress(show, permanentProgress);
                return (
                <div key={show.title} className="relative group aspect-[2/3] w-36 md:w-48 flex-shrink-0 cursor-pointer rounded-md overflow-hidden bg-zinc-800 transition-transform duration-300 delay-150 hover:scale-110 hover:z-40 hover:shadow-2xl" onClick={() => openModal(show)}>
                  {show.poster ? <img src={show.poster} alt={show.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center p-4 text-center font-medium">{show.title}</div>}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition"><svg className="w-8 h-8 text-white drop-shadow-md" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"></path></svg></div>
                  
                  {getResumeLabel(show, permanentProgress) && (
                    <div className="absolute bottom-2 left-2 right-2 text-white text-[11px] md:text-xs font-extrabold opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] tracking-wide">
                      {getResumeLabel(show, permanentProgress)}
                    </div>
                  )}
                  {progress > 0 && <div className="absolute bottom-0 left-0 h-[4px] bg-zinc-600 w-full z-10"><div className="h-full bg-red-600" style={{ width: `${progress}%` }} /></div>}
                </div>
              )})}
          </CarouselRow>
        )}

        {isSearching && filteredMovies.length === 0 && filteredSeries.length === 0 && (
           <div className="w-full pt-20 flex flex-col items-center justify-center text-zinc-500">
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <h2 className="text-xl font-medium">No results found for "{searchQuery}"</h2>
           </div>
        )}
      </div>

      {/* MEDIA DETAILS MODAL */}
      {selectedMedia && (
        <div className={`fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm overflow-y-auto pt-10 px-4 md:px-20 pb-20 transition-opacity duration-500 ease-out ${isModalVisible ? 'opacity-100' : 'opacity-0'}`} onClick={handleCloseModal}>
          <div className={`relative max-w-5xl mx-auto bg-[#181818] rounded-xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] ring-1 ring-zinc-800 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] transform origin-center ${isModalVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-8'}`} onClick={(e) => e.stopPropagation()}>
            <button onClick={handleCloseModal} className="absolute top-4 right-4 z-[80] p-2 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-zinc-700 transition pointer-events-auto border border-white/10">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <div className="relative h-64 md:h-[500px] w-full bg-zinc-900 overflow-hidden">
              <img src={selectedMedia.backdrop || selectedMedia.poster} alt={selectedMedia.title} className="absolute inset-0 w-full h-full object-cover opacity-0 anim-modal" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-[#181818]/40 to-transparent" />
              
              <div className="absolute bottom-6 left-6 md:left-12 max-w-2xl z-10">
                <h2 className="text-3xl md:text-5xl font-bold text-white drop-shadow-lg mb-4">{selectedMedia.title}</h2>
                <div className="flex items-center gap-4">
                  <button onClick={() => { if (selectedMedia.type === 'movie') handlePlay(selectedMedia.path); else if (selectedMedia.type === 'series') { const pathToPlay = getResumePathForSeries(selectedMedia, permanentProgress); handlePlay(pathToPlay); } }} className="flex items-center gap-2 px-6 py-2 bg-white text-black font-bold rounded text-lg hover:bg-white/80 pointer-events-auto transition shadow-lg">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> 
                    {getProgress(selectedMedia, permanentProgress) > 0 ? "Resume" : "Play"}
                  </button>
                  
                  {getProgress(selectedMedia, permanentProgress) > 0 && (
                    <span className="text-zinc-400 font-medium text-sm md:text-base drop-shadow-md border-l-2 border-red-600 pl-3 py-1">
                      {getResumeLabel(selectedMedia, permanentProgress)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 md:p-12">
              <p className="text-gray-300 text-sm md:text-base mb-8 md:w-3/4 leading-relaxed">{selectedMedia.overview}</p>
              
              {selectedMedia.type === 'series' && selectedSeason && (
                <>
                  <div className="flex items-center justify-between border-b border-zinc-700 pb-4 mb-6">
                    <h3 className="text-xl md:text-2xl font-bold text-white">Episodes</h3>
                    <select className="bg-zinc-800 text-white font-semibold text-lg border border-zinc-600 rounded px-4 py-2 cursor-pointer outline-none focus:ring-2 focus:ring-white/50" value={selectedSeason.title} onChange={(e) => { const found = selectedMedia.seasons.find(s => s.title === e.target.value); if (found) setSelectedSeason(found); }}>
                      {selectedMedia.seasons.map(season => <option key={season.title} value={season.title}>{season.title}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    {selectedSeason.episodes.map((episode, index) => {
                      const val = permanentProgress[episode.path];
                      const epProg = typeof val === 'number' ? val : (val?.progress || 0);
                      return (
                      <div key={episode.id} onClick={() => handlePlay(episode.path)} className="flex flex-row items-center gap-4 p-4 rounded-lg hover:bg-white/5 cursor-pointer group transition-colors border-b border-white/5 relative overflow-hidden">
                        <div className="text-zinc-500 font-medium text-lg w-6 text-center">{index + 1}</div>
                        <div className="relative w-32 md:w-40 aspect-video bg-zinc-700 rounded overflow-hidden flex-shrink-0">
                          <img src={episode.thumbnail || selectedMedia.backdrop} className="w-full h-full object-cover" alt={episode.title} />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition"><svg className="w-10 h-10 text-white border-2 border-white rounded-full p-1 bg-black/50" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></div>
                          {epProg > 0 && <div className="absolute bottom-0 left-0 h-1 bg-zinc-600 w-full z-10"><div className="h-full bg-red-600" style={{ width: `${epProg}%` }} /></div>}
                        </div>
                        <div className="flex flex-col justify-center w-full">
                          <div className="flex justify-between items-center w-full pr-4">
                            <h4 className="text-white font-bold text-sm md:text-lg group-hover:text-red-500 transition-colors">{episode.title}</h4>
                            {epProg > 0 && <span className="text-xs text-red-500 font-bold uppercase tracking-wider bg-red-500/10 px-2 py-1 rounded">Resume</span>}
                          </div>
                          <p className="text-zinc-400 text-xs md:text-sm mt-1 line-clamp-2 md:w-3/4">{episode.overview}</p>
                        </div>
                      </div>
                    )})}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
     {/* THE PREMIUM IN-APP PLAYER */}
      {internalMediaPath && (
        <Player 
          mediaPath={internalMediaPath}
          duration={permanentProgress[internalMediaPath]?.length || 0} 
          initialTime={typeof permanentProgress[internalMediaPath] === 'number' ? permanentProgress[internalMediaPath] : (permanentProgress[internalMediaPath]?.time || 0)}
          onClose={() => {
            setinternalMediaPath(null);
            fetchProgress(); 
          }} 
        />
      )}
    </div>
  );
}

