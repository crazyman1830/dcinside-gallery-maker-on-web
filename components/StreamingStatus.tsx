
import React, { useEffect, useState, useRef } from 'react';

interface StreamingStatusProps {
  streamingText: string;
}

export const StreamingStatus: React.FC<StreamingStatusProps> = ({ streamingText }) => {
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>(["AI 모델 연결 중..."]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let newProgress = 5;
    const currentLogs = [...logs];
    
    const nextLogs: string[] = [];

    if (streamingText) {
        newProgress = 10;
        if (streamingText.length > 50 && !logs.includes("스트림 데이터 수신 시작...")) nextLogs.push("스트림 데이터 수신 시작...");
        
        if (streamingText.includes("galleryTitle") && !logs.includes("갤러리 세계관 확립 중...")) {
            nextLogs.push("갤러리 세계관 확립 중...");
            newProgress = 20;
        }

        if (streamingText.includes('"posts"') && !logs.includes("게시물 데이터 구조 생성 중...")) {
            nextLogs.push("게시물 데이터 구조 생성 중...");
            newProgress = 30;
        }

        const postCount = (streamingText.match(/"title":/g) || []).length;
        if (postCount > 0) {
            const logMsg = `게시물 #${postCount} 및 작성자 페르소나 생성...`;
            if (!logs.includes(logMsg)) nextLogs.push(logMsg);
            newProgress = 30 + (postCount * 10); 
        }

        const commentCount = (streamingText.match(/"text":/g) || []).length;
        if (commentCount > 0) {
            if (commentCount % 5 === 0 || commentCount === 1) {
                 const logMsg = `커뮤니티 반응 시뮬레이션 중 (댓글 ${commentCount}개)...`;
                 if (logs[logs.length - 1] !== logMsg) nextLogs.push(logMsg);
            }
            newProgress += (commentCount * 0.5);
        }

        newProgress = Math.min(newProgress, 99);
    }

    if (nextLogs.length > 0) {
        setLogs(prev => [...prev, ...nextLogs]);
    }
    
    setProgress(prev => Math.max(prev, newProgress));
  }, [streamingText]);

  useEffect(() => {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="my-8 w-full max-w-3xl mx-auto bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-700 font-mono text-left ring-1 ring-slate-900/5">
      {/* Header */}
      <div className="bg-slate-800 px-5 py-3 flex items-center justify-between border-b border-slate-700/50">
        <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-sm"></div>
            <div className="w-3 h-3 rounded-full bg-amber-500/80 shadow-sm"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-sm"></div>
        </div>
        <span className="text-xs text-slate-400 font-semibold tracking-wide">GEMINI GENERATION PROTOCOL</span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-800 h-1.5">
        <div 
            className="bg-blue-500 h-full transition-all duration-500 ease-out shadow-[0_0_15px_rgba(59,130,246,0.6)] relative"
            style={{ width: `${progress}%` }}
        >
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-r from-transparent to-white/30"></div>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6 flex flex-col sm:flex-row gap-8">
        {/* Spinner & Main Status */}
        <div className="flex flex-col items-center justify-center min-w-[140px]">
             <div className="relative flex items-center justify-center w-24 h-24">
                <div className="absolute w-full h-full rounded-full border-[3px] border-blue-500/10 animate-pulse"></div>
                <div className="absolute w-full h-full rounded-full border-[3px] border-t-blue-500 border-r-blue-500/30 border-b-transparent border-l-transparent animate-spin"></div>
                <div className="flex flex-col items-center justify-center z-10">
                    <span className="text-white font-bold text-2xl">{Math.round(progress)}<span className="text-sm text-slate-500">%</span></span>
                </div>
             </div>
             <p className="mt-4 text-blue-400 font-bold text-xs tracking-[0.2em] uppercase animate-pulse">Processing</p>
        </div>

        {/* Log Output */}
        <div className="flex-1 bg-black/30 rounded-xl p-4 h-56 overflow-y-auto text-xs sm:text-sm flex flex-col shadow-inner font-mono border border-slate-700/50 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
            {logs.map((log, index) => (
                <div key={index} className="mb-2 animate-fade-in flex items-start">
                    <span className="text-emerald-500 mr-3 shrink-0 select-none">➜</span>
                    <span className="text-slate-300 break-all leading-relaxed">{log}</span>
                </div>
            ))}
            <div ref={logEndRef} />
            <div className="mt-2 flex items-center text-slate-500 animate-pulse">
                <span className="mr-2 ml-1">_</span>
            </div>
        </div>
      </div>
    </div>
  );
};
