import React, { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface TitlebarProps {
  dark: boolean;
  onToggleTheme?: () => void;
  title?: string;
}

export const Titlebar: React.FC<TitlebarProps> = ({ dark, onToggleTheme, title = 'Strata' }) => {
  useEffect(() => {
    try {
      const win = getCurrentWindow();
      win.setDecorations(false).catch(() => {});
      win.setTheme(dark ? 'dark' : 'light').catch(() => {});
    } catch {
      // Web tarayıcıda çalışırken Tauri penceresi yoksa yoksay
    }
  }, [dark]);

  const handleMinimize = () => {
    try {
      getCurrentWindow().minimize();
    } catch {}
  };

  const handleMaximize = () => {
    try {
      getCurrentWindow().toggleMaximize();
    } catch {}
  };

  const handleClose = () => {
    try {
      getCurrentWindow().close();
    } catch {}
  };

  return (
    <div
      data-tauri-drag-region
      className={`h-9 w-full flex items-center justify-between px-3 select-none shrink-0 z-50 transition-colors duration-200 border-b ${
        dark
          ? 'bg-[#18181B] text-zinc-300 border-white/[0.06]'
          : 'bg-[#F3F4F6] text-zinc-700 border-zinc-200/80'
      }`}
    >
      {/* Sol: Uygulama İkonu ve Başlık */}
      <div data-tauri-drag-region className="flex items-center gap-2 pointer-events-none">
        <div className="w-4 h-4 rounded-md bg-gradient-to-br from-[#6D4AFF] to-[#5433FF] flex items-center justify-center shadow-sm">
          <span className="text-[10px] font-extrabold text-white leading-none">S</span>
        </div>
        <span className="text-xs font-semibold tracking-tight opacity-85">{title}</span>
      </div>

      {/* Orta Sürükleme Alanı */}
      <div data-tauri-drag-region className="flex-1 h-full" />

      {/* Sağ: Tema Değiştirici + Pencere Kontrolleri */}
      <div className="flex items-center gap-1">
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors mr-1 ${
              dark
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10'
                : 'bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 shadow-2xs'
            }`}
            title={dark ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
          >
            {dark ? (
              <>
                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Açık</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-[#6D4AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span>Koyu</span>
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={handleMinimize}
          className={`w-8 h-7 rounded-md flex items-center justify-center transition-colors ${
            dark ? 'hover:bg-white/10 text-zinc-400 hover:text-white' : 'hover:bg-black/5 text-zinc-500 hover:text-zinc-900'
          }`}
          title="Küçült"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleMaximize}
          className={`w-8 h-7 rounded-md flex items-center justify-center transition-colors ${
            dark ? 'hover:bg-white/10 text-zinc-400 hover:text-white' : 'hover:bg-black/5 text-zinc-500 hover:text-zinc-900'
          }`}
          title="Tam Ekran"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="w-8 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-red-500 hover:text-white text-zinc-400"
          title="Kapat"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

