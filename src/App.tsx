/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Activity, Camera as CameraIcon, Mic, Smartphone, Video, AlertOctagon } from 'lucide-react';

type TaskType = 'audio' | 'photo' | 'activity' | null;

export default function App() {
  const [violations, setViolations] = useState(1048294);
  const [activeTask, setActiveTask] = useState<TaskType>(null);
  const [taskProgress, setTaskProgress] = useState(0);
  const [isVibrating, setIsVibrating] = useState(false);
  const [wallpaperApplied, setWallpaperApplied] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [pendingTask, setPendingTask] = useState<TaskType>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const alertSound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Alert sound setup (User provided landing page, using a direct siren-like mp3)
    alertSound.current = new Audio('https://www.soundjay.com/buttons/beep-01a.mp3');
    alertSound.current.loop = true;
    return () => { alertSound.current?.pause(); };
  }, []);

  // Trigger a new task alert
  const triggerTask = useCallback((type: TaskType) => {
    setPendingTask(type);
    setIsAlertActive(true);
    setTimeLeft(15);
    setIsVibrating(true);
    
    if (alertSound.current) {
        alertSound.current.currentTime = 0;
        alertSound.current.play().catch(e => console.log("Audio play blocked", e));
    }

    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200, 500, 200, 100, 200]);
    }
    
    setTimeout(() => setIsVibrating(false), 2000);
  }, []);

  // Task Loop
  useEffect(() => {
    // Initial immediate task on mount
    triggerTask('activity'); 

    const taskInterval = setInterval(() => {
      if (!activeTask && !wallpaperApplied && !isAlertActive) {
        const tasks: TaskType[] = ['audio', 'photo', 'activity'];
        const randomTask = tasks[Math.floor(Math.random() * tasks.length)];
        triggerTask(randomTask);
      }
    }, 20000); 
    return () => clearInterval(taskInterval);
  }, [triggerTask]); // removed activeTask dependency to avoid loops, interval handles it

  // Clean up streams
  const stopStreams = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, [stream]);

  const completeTask = () => {
    stopStreams();
    setActiveTask(null);
    setTaskProgress(0);
  };

  const handleFail = useCallback(() => {
    stopStreams();
    setViolations(v => v + 12500); // Penalty
    setWallpaperApplied(true);
    setIsAlertActive(false);
    setActiveTask(null);
    if (alertSound.current) alertSound.current.pause();

    setTimeout(() => {
      setWallpaperApplied(false);
    }, 5000);
  }, [stopStreams]);

  // Acceptance Timer Logic
  useEffect(() => {
    let timer: number;
    if (isAlertActive && timeLeft > 0) {
      timer = window.setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (isAlertActive && timeLeft === 0) {
      handleFail();
    }
    return () => clearInterval(timer);
  }, [isAlertActive, timeLeft, handleFail]);

  const acceptAlert = () => {
    setIsAlertActive(false);
    setActiveTask(pendingTask);
    setTaskProgress(0);
    setAudioLevel(0);
    if (alertSound.current) alertSound.current.pause();
  };

  // Camera logic
  useEffect(() => {
    if (activeTask === 'photo') {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        .then(s => {
          setStream(s);
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        })
        .catch(err => console.error("Camera access denied", err));
    }
    return () => {
      if (activeTask === 'photo') stopStreams();
    };
  }, [activeTask, stopStreams]);

  // Audio logic
  useEffect(() => {
    if (activeTask === 'audio') {
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(s => {
          setStream(s);
          const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
          const audioContext = new AudioContextClass();
          const analyser = audioContext.createAnalyser();
          const source = audioContext.createMediaStreamSource(s);
          source.connect(analyser);
          analyser.fftSize = 256;
          
          audioContextRef.current = audioContext;
          analyserRef.current = analyser;

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          const checkAudio = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i];
            }
            const average = sum / bufferLength;
            setAudioLevel(average);

            // If screaming enough (threshold ~70)
            if (average > 70) {
              setTaskProgress(prev => {
                const next = prev + 2;
                if (next >= 100) {
                  setTimeout(completeTask, 500);
                  return 100;
                }
                return next;
              });
            }
            animationFrameRef.current = requestAnimationFrame(checkAudio);
          };
          checkAudio();
        })
        .catch(err => console.error("Mic access denied", err));
    }
    return () => {
      if (activeTask === 'audio') stopStreams();
    };
  }, [activeTask, stopStreams]);

  // Accelerometer sensor
  useEffect(() => {
    if (activeTask === 'activity') {
      const handleMotion = (e: DeviceMotionEvent) => {
        const acc = e.accelerationIncludingGravity;
        if (acc) {
          const total = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
          if (total > 15) {
            setTaskProgress(p => (p >= 40 ? 40 : p + 1));
          }
        }
      };
      window.addEventListener('devicemotion', handleMotion);
      return () => window.removeEventListener('devicemotion', handleMotion);
    }
  }, [activeTask]);

  useEffect(() => {
    if (activeTask === 'activity' && taskProgress >= 40) {
      setTimeout(completeTask, 500);
    }
  }, [taskProgress, activeTask]);

  return (
    <div className={`w-full h-screen text-polish-gold font-serif overflow-hidden relative select-none border-[6px] md:border-[12px] border-polish-gold flex flex-col transition-all duration-1000 ${isVibrating ? 'animate-shake' : ''} ${wallpaperApplied ? 'bg-black' : 'bg-polish-blue-dark'}`}>
      
      {/* Real Wallpaper Simulation - App Background */}
      {wallpaperApplied && (
        <div className="absolute inset-0 z-0">
          <img 
            src="https://upload.wikimedia.org/wikipedia/commons/7/78/Pongo_pygmaeus_%28orangutang%29.jpg"
            alt=""
            className="w-full h-full object-cover opacity-40 grayscale"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {/* Header */}
      <header className="w-full h-20 md:h-24 bg-polish-blue border-b-2 md:border-b-4 border-polish-gold flex items-center justify-between px-4 md:px-10 shadow-2xl z-10 shrink-0">
        <div className="flex items-center gap-2 md:gap-6 overflow-hidden">
          <div className="w-10 h-10 md:w-16 md:h-16 border-2 border-polish-gold rounded-full flex items-center justify-center bg-polish-blue-dark shrink-0">
            <Shield size={20} className="text-polish-gold md:hidden" />
            <Shield size={32} className="text-polish-gold hidden md:block" />
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="text-sm md:text-2xl font-black tracking-widest uppercase leading-tight truncate">ГИС «ОРАНГУТАНГ-КОНТРОЛЬ»</h1>
            <p className="text-[8px] md:text-xs tracking-[0.1em] md:tracking-[0.3em] opacity-80 uppercase font-sans truncate">Центральный аппарат мониторинга лояльности</p>
          </div>
        </div>
        <div className="text-right hidden sm:flex flex-col justify-center shrink-0 ml-2">
          <div className="text-[8px] md:text-[10px] opacity-60 uppercase tracking-[0.1em] md:tracking-[0.2em] mb-0.5 md:mb-1">Код: 09-X-PRIMATE</div>
          <div className="text-xs md:text-lg font-bold text-white tracking-widest">RU-05</div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center space-y-6 md:space-y-12 px-4 md:px-20 relative overflow-y-auto pt-4 pb-8">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
           <Shield className="w-64 h-64 md:w-[600px] md:h-[600px]" />
        </div>

        <div className="text-center z-10 w-full">
          <div className="text-[10px] md:text-xl tracking-[0.2em] md:tracking-[0.4em] mb-2 md:mb-4 opacity-70 font-sans font-bold uppercase">КОЛИЧЕСТВО НАРУШЕНИЙ</div>
          <motion.div 
            key={violations}
            className="text-5xl md:text-[120px] font-black text-polish-red leading-none drop-shadow-[0_0_20px_rgba(255,49,49,0.4)] tabular-nums"
          >
            {violations.toLocaleString()}
          </motion.div>
        </div>

        <div className="bg-polish-blue border-2 border-polish-red px-6 md:px-12 py-4 md:py-6 shadow-[0_0_30px_rgba(255,49,49,0.2)] z-10 w-full max-w-sm md:max-w-none text-center">
          <div className="text-lg md:text-4xl font-black text-polish-red animate-pulse uppercase tracking-tighter">
            Статус: Выявлен Примат
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6 w-full max-w-4xl z-10 font-sans">
          <div className="border border-polish-gold/50 p-3 md:p-4 bg-polish-blue/50 flex flex-col items-center text-center">
            <div className="text-[8px] md:text-[10px] uppercase opacity-50 mb-1 md:mb-2 tracking-widest font-bold">Биометрия</div>
            <div className="text-[10px] md:text-xs font-bold uppercase truncate w-full">ВОЛОСЯНОЙ ПОКРОВ: <span className="text-polish-red">КРИТИЧЕСКИЙ</span></div>
          </div>
          <div className="border border-polish-gold/50 p-3 md:p-4 bg-polish-blue/50 flex flex-col items-center text-center">
            <div className="text-[8px] md:text-[10px] uppercase opacity-50 mb-1 md:mb-2 tracking-widest font-bold">Акустика</div>
            <div className="text-[10px] md:text-xs font-bold uppercase truncate w-full">ДЕТЕКТОР КРИКА: <span className={audioLevel > 30 ? "text-polish-red animate-pulse" : "text-green-500"}>
              {audioLevel > 30 ? "КРИК!" : "ОЖИДАНИЕ"}
            </span></div>
          </div>
          <div className="border border-polish-gold/50 p-3 md:p-4 bg-polish-blue/50 flex flex-col items-center text-center">
            <div className="text-[8px] md:text-[10px] uppercase opacity-50 mb-1 md:mb-2 tracking-widest font-bold">Движение</div>
            <div className="text-[10px] md:text-xs font-bold uppercase truncate w-full">АКСЕЛЕРОМЕТР: <span className="text-polish-red">ХАОТИЧНО</span></div>
          </div>
        </div>
      </main>

      {/* Marquee Footer */}
      <footer className="h-12 bg-polish-gold text-polish-blue-dark flex items-center justify-center font-bold px-10 overflow-hidden relative z-10 shrink-0">
        <div className="whitespace-nowrap flex animate-marquee gap-10 text-[10px] tracking-tight uppercase">
          {[...Array(10)].map((_, i) => (
            <span key={i}>ВНИМАНИЕ: ПРИМАТ ПОД НАБЛЮДЕНИЕМ • ВСЕ СЕНСОРЫ АКТИВНЫ • ПРОВЕРКА ЛОЯЛЬНОСТИ • </span>
          ))}
        </div>
      </footer>

      {/* Acceptance Alert Dialog */}
      <AnimatePresence>
        {isAlertActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-red-900/60 backdrop-blur-md flex items-center justify-center z-[60] p-4"
          >
            <motion.div 
              initial={{ scale: 0.8, rotate: -5 }}
              animate={{ scale: 1, rotate: 0 }}
              className="w-full max-w-sm bg-polish-blue border-4 border-polish-red p-8 shadow-[0_0_50px_rgba(255,49,49,0.5)] text-center relative overflow-hidden"
            >
              {/* Flashing Background Decoration */}
              <motion.div 
                animate={{ opacity: [0, 0.1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="absolute inset-0 bg-polish-red pointer-events-none"
              />

              <AlertOctagon size={64} className="text-polish-red mx-auto mb-4 animate-bounce" />
              <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">НОВАЯ ДИРЕКТИВА!</h2>
              <p className="text-polish-gold text-sm font-sans font-bold uppercase tracking-widest mb-6 px-4">
                У вас есть 15 секунд, чтобы подтвердить получение задания. Игнорирование приравнивается к измене.
              </p>

              <div className="text-5xl font-black text-polish-red mb-8 font-mono tabular-nums">
                00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
              </div>

              <button 
                onClick={acceptAlert}
                className="w-full py-5 bg-polish-red text-white font-black text-2xl uppercase italic skew-x-[-10deg] shadow-lg hover:brightness-125 transition-all"
              >
                ПРИНЯТЬ ПРИКАЗ
              </button>

              <div className="mt-6 text-[8px] text-white/40 uppercase tracking-[0.5em] font-bold">
                ЛОЯЛЬНОСТЬ — ЭТО ПОВИНОВЕНИЕ
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task Dialog */}
      <AnimatePresence>
        {activeTask && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-[500px] bg-polish-parchment border-[6px] border-polish-brown p-1 shadow-[20px_20px_0px_#000]"
            >
              <div className="bg-polish-parchment border border-polish-brown p-8 text-[#1a0f00]">
                {/* Visual Feedback Area */}
                <div className="mb-6 flex justify-center">
                  <div className="w-full aspect-video bg-black rounded border-2 border-polish-brown overflow-hidden relative flex items-center justify-center">
                    {activeTask === 'photo' && (
                      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                    )}
                    {activeTask === 'audio' && (
                      <div className="flex items-center justify-center w-full h-full">
                        <div className="flex items-end gap-1 h-32">
                          {[...Array(12)].map((_, i) => (
                            <motion.div 
                              key={i}
                              animate={{ height: Math.max(4, (audioLevel / 100) * 128 * (Math.random() * 0.5 + 0.5)) }}
                              className="w-3 bg-polish-brown rounded-t-sm"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {activeTask === 'activity' && (
                      <div className="flex flex-col items-center justify-center">
                        <Smartphone size={64} className={`text-polish-brown ${taskProgress > 0 ? "animate-bounce" : ""}`} />
                      </div>
                    )}
                    {!stream && activeTask !== 'activity' && (
                      <div className="text-[10px] text-white/50 uppercase tracking-widest text-center px-4">
                        Ожидание доступа к оборудованию...
                      </div>
                    )}
                    <div className="absolute top-2 left-2 flex items-center gap-1">
                       <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                       <span className="text-[8px] text-white font-mono">REC</span>
                    </div>
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-center mb-4 uppercase tracking-tighter font-serif border-b border-polish-brown pb-2">СРОЧНАЯ ПРОВЕРКА ЛОЯЛЬНОСТИ</h2>
                
                <p className="text-center font-black mb-8 text-lg italic uppercase leading-tight min-h-[3em] flex items-center justify-center">
                  {activeTask === 'audio' && "ПРООРИТЕ В МИКРОФОН КАК ОРАНГУТАНГ!"}
                  {activeTask === 'photo' && "СМОТРИТЕ В КАМЕРУ И УЛЫБНИТЕСЬ!"}
                  {activeTask === 'activity' && "ТРЯСИТЕ УСТРОЙСТВО СИЛЬНЕЕ!"}
                </p>

                <div className="flex flex-col gap-4">
                  {/* Progress Bars */}
                  <div className="h-4 bg-white/50 border border-polish-brown relative overflow-hidden">
                    <motion.div 
                      className="absolute top-0 left-0 h-full bg-polish-brown shadow-[0_0_10px_rgba(139,69,19,0.5)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${activeTask === 'activity' ? (taskProgress/40)*100 : taskProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-black uppercase text-polish-brown">
                    <span>ПРОГРЕСС АНАЛИЗА</span>
                    <span>{Math.round(activeTask === 'activity' ? (taskProgress/40)*100 : taskProgress)}%</span>
                  </div>
                  
                  {activeTask === 'photo' && (
                    <button 
                      onClick={completeTask}
                      className="mt-4 py-4 bg-polish-brown text-polish-parchment font-black uppercase text-xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-3"
                    >
                      <Video size={24} /> СДЕЛАТЬ ФОТО
                    </button>
                  )}

                  {activeTask === 'activity' && (
                    <button 
                      onClick={() => setTaskProgress(p => Math.min(40, p + 5))}
                      className="mt-2 py-2 border-dash border-2 border-polish-brown/30 text-[9px] uppercase font-bold text-polish-brown/60 hover:bg-polish-brown hover:text-white transition-all underline decoration-dotted"
                    >
                      [ РУЧНАЯ ВСТРЯСКА ]
                    </button>
                  )}
                  
                  <div className="flex gap-2 mt-4">
                    <button 
                      onClick={handleFail}
                      className="w-full py-4 border-2 border-polish-red text-polish-red font-black uppercase text-xs hover:bg-polish-red hover:text-white transition-all"
                    >
                      ОТКАЗАТЬСЯ (ШТРАФ)
                    </button>
                  </div>
                  
                  <div className="mt-8 opacity-40 text-[8px] uppercase tracking-[0.4em] text-center font-bold">
                     ГосПриматКонтроль • Версия 2.0.24
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fail Overlay (Wallpaper simulation) */}
      <AnimatePresence>
        {wallpaperApplied && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-0 overflow-hidden"
          >
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/7/78/Pongo_pygmaeus_%28orangutang%29.jpg"
              alt="ORANGUTAN"
              className="w-full h-full object-cover grayscale brightness-50"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-polish-red/40 flex flex-col items-center justify-center p-12 text-center pointer-events-none">
                <AlertOctagon size={120} className="text-white mb-8 animate-bounce" />
                <div className="text-6xl md:text-8xl font-black text-white uppercase tracking-tighter mb-4 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">
                    ПРИМАТ ВЫЯВЛЕН
                </div>
                <div className="bg-white text-polish-blue-dark px-8 py-4 font-sans font-black text-xl uppercase skew-x-[-10deg] shadow-2xl">
                    УСТАНОВКА ПРИНУДИТЕЛЬНЫХ ОБОЕВ... 100%
                </div>
                <div className="mt-8 text-white font-mono text-sm uppercase bg-black/60 p-4 border border-white/20">
                    Нарушение зафиксировано в личном деле. <br/> Штрафные баллы начислены.
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
