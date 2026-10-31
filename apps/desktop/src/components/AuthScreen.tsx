import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Titlebar } from './Titlebar';

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
  avatarHash?: string | null;
  mfaEnabled?: boolean;
}

export interface AuthSuccessPayload {
  accessToken: string;
  refreshToken?: string;
  user: AuthenticatedUser;
}

interface AuthScreenProps {
  apiUrl: string;
  onAuthSuccess?: (data: AuthSuccessPayload) => void;
  onLoginSuccess?: (token: string, user: AuthenticatedUser) => void;
}

type PandaPose = 'idle' | 'tracking' | 'cover' | 'peek';

const PandaMascot: React.FC<{
  pose: PandaPose;
  lookOffset: number;
  dark: boolean;
}> = ({ pose, lookOffset, dark }) => {
  const eyeX = pose === 'tracking' ? Math.max(-5, Math.min(5, lookOffset)) : 0;
  const eyeY = pose === 'tracking' ? 2 : 0;
  const headX = pose === 'tracking' ? eyeX * 0.4 : 0;

  const isCovering = pose === 'cover' || pose === 'peek';
  const isPeeking = pose === 'peek';

  const leftHandStyle: React.CSSProperties = {
    transform: isCovering ? 'translate(22px, -62px) rotate(25deg)' : 'translate(0px, 0px) rotate(0deg)',
    transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
    transformOrigin: '45px 132px',
  };

  const rightHandStyle: React.CSSProperties = {
    transform: isPeeking
      ? 'translate(-18px, -38px) rotate(-12deg)'
      : isCovering
      ? 'translate(-22px, -62px) rotate(-25deg)'
      : 'translate(0px, 0px) rotate(0deg)',
    transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
    transformOrigin: '155px 132px',
  };

  const outlineColor = dark ? '#141414' : '#1E1B2E';
  const patchColor = dark ? '#181818' : '#1E1B2E';
  const padColor = dark ? '#333333' : '#3B3554';

  return (
    <div className="relative select-none flex justify-center -mb-6 z-20 pointer-events-none">
      <svg width="170" height="145" viewBox="0 0 200 165" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Gövde */}
        <ellipse cx="100" cy="145" rx="52" ry="30" fill="#FFFFFF" stroke={outlineColor} strokeWidth="4" />

        {/* Kafa Grubu */}
        <g
          style={{
            transform: `translate(${headX}px, 0px)`,
            transition: 'transform 0.2s ease-out',
          }}
        >
          {/* Kulaklar */}
          <circle cx="54" cy="36" r="18" fill={patchColor} />
          <circle cx="54" cy="36" r="9" fill={padColor} />
          <circle cx="146" cy="36" r="18" fill={patchColor} />
          <circle cx="146" cy="36" r="9" fill={padColor} />

          {/* Kafa */}
          <ellipse cx="100" cy="76" rx="54" ry="46" fill="#FFFFFF" stroke={outlineColor} strokeWidth="4" />

          {/* Yanaklar */}
          <ellipse cx="64" cy="88" rx="8" ry="4.5" fill="#FDA4AF" opacity="0.65" />
          <ellipse cx="136" cy="88" rx="8" ry="4.5" fill="#FDA4AF" opacity="0.65" />

          {/* Sol Göz Yaması */}
          <ellipse
            cx="77"
            cy="72"
            rx="14"
            ry="17"
            transform="rotate(-10 77 72)"
            fill={patchColor}
          />
          {/* Sağ Göz Yaması */}
          <ellipse
            cx="123"
            cy="72"
            rx="14"
            ry="17"
            transform="rotate(10 123 72)"
            fill={patchColor}
          />

          {/* Göz Bebekleri */}
          <g
            style={{
              transform: `translate(${eyeX}px, ${eyeY}px)`,
              transition: 'transform 0.12s ease-out',
            }}
          >
            <circle cx="78" cy="71" r="6" fill="#FFFFFF" />
            <circle cx="78" cy="71" r="3.2" fill={patchColor} />
            <circle cx="80" cy="69" r="1.5" fill="#FFFFFF" />

            <circle cx="122" cy="71" r="6" fill="#FFFFFF" />
            <circle cx="122" cy="71" r="3.2" fill={patchColor} />
            <circle cx="124" cy="69" r="1.5" fill="#FFFFFF" />
          </g>

          {/* Burun */}
          <ellipse cx="100" cy="86" rx="7" ry="5" fill={patchColor} />
          <ellipse cx="98.5" cy="84.5" rx="2.2" ry="1.2" fill="#FFFFFF" opacity="0.7" />

          {/* Ağız */}
          <path
            d="M93 94 Q100 100 107 94"
            stroke={patchColor}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Sol Pati */}
        <g style={leftHandStyle}>
          <ellipse cx="48" cy="132" rx="16" ry="22" fill={patchColor} />
          <circle cx="48" cy="128" r="5" fill={padColor} />
          <circle cx="41" cy="120" r="2.5" fill={padColor} />
          <circle cx="48" cy="118" r="2.5" fill={padColor} />
          <circle cx="55" cy="120" r="2.5" fill={padColor} />
        </g>

        {/* Sağ Pati */}
        <g style={rightHandStyle}>
          <ellipse cx="152" cy="132" rx="16" ry="22" fill={patchColor} />
          <circle cx="152" cy="128" r="5" fill={padColor} />
          <circle cx="145" cy="120" r="2.5" fill={padColor} />
          <circle cx="152" cy="118" r="2.5" fill={padColor} />
          <circle cx="159" cy="120" r="2.5" fill={padColor} />
        </g>
      </svg>
    </div>
  );
};

export const AuthScreen: React.FC<AuthScreenProps> = ({
  apiUrl,
  onAuthSuccess,
  onLoginSuccess,
}) => {
  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('strata_theme');
    return saved ? saved === 'dark' : true;
  });

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [activeField, setActiveField] = useState<'none' | 'text' | 'password'>('none');

  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('strata_theme', dark ? 'dark' : 'light');
    document.documentElement.style.backgroundColor = dark ? '#202020' : '#F3F3F3';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';

    try {
      const win = getCurrentWindow();
      win.setDecorations(false).catch(() => {});
      win.setTheme(dark ? 'dark' : 'light').catch(() => {});
    } catch {
      // Tarayıcı ortamında Tauri penceresi yoksa yoksay
    }
  }, [dark]);

  let pose: PandaPose = 'idle';
  if (activeField === 'password') {
    pose = showPassword ? 'peek' : 'cover';
  } else if (activeField === 'text') {
    pose = 'tracking';
  }

  const currentTextLength = (mode === 'register' && email ? email.length : username.length) || 0;
  const lookOffset = (currentTextLength - 10) * 0.45;

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setError(null);
    setMfaTicket(null);
    setMfaCode('');
  };

  const notifySuccess = (data: { accessToken: string; refreshToken?: string; user: AuthenticatedUser }) => {
    if (onAuthSuccess) {
      onAuthSuccess({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
    }
    if (onLoginSuccess) {
      onLoginSuccess(data.accessToken, data.user);
    }
  };

  const extractErrorMessage = (data: any, fallback: string): string => {
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      return data.errors[0].message || fallback;
    }
    return data?.error || data?.message || fallback;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mfaTicket) {
        const res = await fetch(`${apiUrl}/api/v1/auth/mfa/totp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-type': 'desktop',
          },
          body: JSON.stringify({ ticket: mfaTicket, code: mfaCode.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(extractErrorMessage(data, 'Doğrulama kodu hatalı.'));
        }
        notifySuccess(data);
        return;
      }

      const endpoint = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
      const body =
        mode === 'login'
          ? {
              login: username.trim(),
              password,
              clientType: 'desktop',
              deviceName: 'Strata Desktop',
            }
          : {
              username: username.trim().toLowerCase(),
              email: email.trim().toLowerCase(),
              password,
              displayName: displayName.trim() || username.trim(),
            };

      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-type': 'desktop',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, 'İşlem başarısız oldu.'));
      }

      const ticket = data.mfaTicket || data.ticket;
      if (data.mfaRequired && ticket) {
        setMfaTicket(ticket);
        setLoading(false);
        return;
      }

      notifySuccess(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message === 'Failed to fetch'
            ? 'Bulut API sunucusuna bağlanılamadı (strata-api-fy4r.onrender.com). Sunucu uyanıyor olabilir, lütfen 10 saniye sonra tekrar deneyin.'
            : err.message
          : 'Beklenmeyen bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`relative h-screen w-full overflow-hidden flex flex-col select-none transition-colors duration-200 ${
        dark ? 'bg-[#18181B] text-[#F3F4F8]' : 'bg-[#F3F4F6] text-[#1E1B2E]'
      }`}
    >
      <Titlebar dark={dark} onToggleTheme={() => setDark((d) => !d)} title="Strata — Giriş" />
      <div className="relative flex-1 w-full flex items-center justify-center px-6 py-6 overflow-y-auto">
      

      {/* Sadece Alt Dalga */}
      <svg
        className="pointer-events-none absolute bottom-0 left-0 w-full h-[130px] md:h-[175px] z-0"
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0,55 C360,185 720,185 1120,115 C1280,85 1380,60 1440,45 L1440,220 L0,220 Z"
          fill={dark ? 'url(#bottomWaveDark)' : 'url(#bottomWaveLight)'}
        />
        <defs>
          <linearGradient id="bottomWaveLight" x1="0" y1="0" x2="1440" y2="220" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6D4AFF" />
            <stop offset="1" stopColor="#5433FF" />
          </linearGradient>
          <linearGradient id="bottomWaveDark" x1="0" y1="0" x2="1440" y2="220" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2B2B2B" />
            <stop offset="1" stopColor="#171717" />
          </linearGradient>
        </defs>
      </svg>

      {/* Ana İçerik */}
      <div className="relative z-10 w-full max-w-4xl flex flex-col md:flex-row items-center justify-center gap-12 md:gap-20">
        {/* Sol Taraf: Panda + Kart */}
        <div className="w-full max-w-[360px] flex flex-col items-center">
          <PandaMascot pose={pose} lookOffset={lookOffset} dark={dark} />

          <div
            className={`w-full rounded-3xl px-8 pt-10 pb-8 transition-colors duration-200 ${
              dark
                ? 'bg-[#2A2A2A] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06]'
                : 'bg-white shadow-[0_18px_50px_rgba(30,27,46,0.08)]'
            }`}
          >
            <h2
              className={`text-center text-2xl font-bold mb-7 ${
                dark ? 'text-white' : 'text-[#1E1B2E]'
              }`}
            >
              {mfaTicket ? 'İki Aşamalı Doğrulama' : mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
            </h2>

            {error && (
              <div
                className={`mb-5 rounded-xl px-3.5 py-2.5 text-xs font-medium text-center ${
                  dark
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                    : 'bg-red-50 border border-red-200 text-red-600'
                }`}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mfaTicket ? (
                <div>
                  <label
                    className={`block text-xs font-semibold mb-1.5 ${
                      dark ? 'text-gray-400' : 'text-gray-500'
                    }`}
                  >
                    6 Haneli Doğrulama Kodu
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={12}
                    value={mfaCode}
                    onFocus={() => setActiveField('text')}
                    onBlur={() => setActiveField('none')}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="000000"
                    className={`w-full bg-transparent border-b-2 py-2 text-sm outline-none transition-colors tracking-widest text-center font-semibold ${
                      dark
                        ? 'border-white/15 focus:border-[#7C5CFF] text-white placeholder-gray-600'
                        : 'border-gray-200 focus:border-[#6D4AFF] text-[#1E1B2E] placeholder-gray-400'
                    }`}
                    required
                  />
                </div>
              ) : (
                <>
                  {/* Kullanıcı Adı */}
                  <div>
                    <label
                      className={`block text-xs font-semibold mb-1 ${
                        dark ? 'text-gray-400' : 'text-gray-500'
                      }`}
                    >
                      {mode === 'login' ? 'Kullanıcı Adı veya E-posta' : 'Kullanıcı Adı'}
                    </label>
                    <input
                      type="text"
                      value={username}
                      onFocus={() => setActiveField('text')}
                      onBlur={() => setActiveField('none')}
                      onChange={(e) =>
                        setUsername(
                          mode === 'register'
                            ? e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '')
                            : e.target.value
                        )
                      }
                      placeholder={mode === 'login' ? 'kullanici_adi veya e-posta' : 'ornek_kullanici'}
                      className={`w-full bg-transparent border-b-2 py-2 text-sm outline-none transition-colors ${
                        dark
                          ? 'border-white/15 focus:border-[#7C5CFF] text-white placeholder-gray-500'
                          : 'border-gray-200 focus:border-[#6D4AFF] text-[#1E1B2E] placeholder-gray-300'
                      }`}
                      required
                    />
                  </div>

                  {/* Görünen Ad & E-posta (Sadece Kayıt) */}
                  {mode === 'register' && (
                    <>
                      <div>
                        <label
                          className={`block text-xs font-semibold mb-1 ${
                            dark ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          Görünen Ad (İsteğe Bağlı)
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onFocus={() => setActiveField('text')}
                          onBlur={() => setActiveField('none')}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Ahmet"
                          className={`w-full bg-transparent border-b-2 py-2 text-sm outline-none transition-colors ${
                            dark
                              ? 'border-white/15 focus:border-[#7C5CFF] text-white placeholder-gray-500'
                              : 'border-gray-200 focus:border-[#6D4AFF] text-[#1E1B2E] placeholder-gray-300'
                          }`}
                        />
                      </div>

                      <div>
                        <label
                          className={`block text-xs font-semibold mb-1 ${
                            dark ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          E-posta
                        </label>
                        <input
                          type="email"
                          value={email}
                          onFocus={() => setActiveField('text')}
                          onBlur={() => setActiveField('none')}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="ornek@mail.com"
                          className={`w-full bg-transparent border-b-2 py-2 text-sm outline-none transition-colors ${
                            dark
                              ? 'border-white/15 focus:border-[#7C5CFF] text-white placeholder-gray-500'
                              : 'border-gray-200 focus:border-[#6D4AFF] text-[#1E1B2E] placeholder-gray-300'
                          }`}
                          required
                        />
                      </div>
                    </>
                  )}

                  {/* Şifre */}
                  <div>
                    <label
                      className={`block text-xs font-semibold mb-1 ${
                        dark ? 'text-gray-400' : 'text-gray-500'
                      }`}
                    >
                      Şifre {mode === 'register' && <span className="text-[10px] opacity-70">(En az 8 karakter)</span>}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        minLength={mode === 'register' ? 8 : 1}
                        onFocus={() => setActiveField('password')}
                        onBlur={() => setActiveField('none')}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`w-full bg-transparent border-b-2 py-2 pr-8 text-sm outline-none transition-colors ${
                          dark
                            ? 'border-white/15 focus:border-[#7C5CFF] text-white placeholder-gray-500'
                            : 'border-gray-200 focus:border-[#6D4AFF] text-[#1E1B2E] placeholder-gray-300'
                        }`}
                        required
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setShowPassword((prev) => !prev);
                          setActiveField('password');
                        }}
                        className={`absolute right-0 top-1/2 -translate-y-1/2 p-1 transition-colors ${
                          dark ? 'text-gray-400 hover:text-[#7C5CFF]' : 'text-gray-400 hover:text-[#6D4AFF]'
                        }`}
                        title={showPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                      >
                        {showPassword ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                            />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Gönder Butonu */}
              <div className="pt-3 flex flex-col items-center gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-44 py-2.5 rounded-full bg-gradient-to-r from-[#6D4AFF] to-[#5433FF] hover:opacity-95 active:scale-[0.98] text-white text-sm font-semibold shadow-md shadow-[#6D4AFF]/25 transition-all disabled:opacity-50"
                >
                  {loading
                    ? 'Bekleyin...'
                    : mfaTicket
                    ? 'Doğrula'
                    : mode === 'login'
                    ? 'Giriş Yap'
                    : 'Kayıt Ol'}
                </button>

                {mfaTicket && (
                  <button
                    type="button"
                    onClick={() => {
                      setMfaTicket(null);
                      setMfaCode('');
                    }}
                    className="text-xs text-gray-400 hover:text-[#6D4AFF] transition-colors"
                  >
                    Geri Dön
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Sağ Taraf: Hoş Geldin & Kayıt Ol / Giriş Yap Geçişi */}
        <div className="text-center md:text-left max-w-xs">
          <h1
            className={`text-3xl md:text-4xl font-extrabold mb-3 ${
              dark ? 'text-white' : 'text-[#1E1B2E]'
            }`}
          >
            Hoş Geldin!
          </h1>
          <p
            className={`text-sm mb-6 leading-relaxed ${
              dark ? 'text-gray-400' : 'text-gray-500'
            }`}
          >
            {mode === 'login'
              ? 'Henüz bir hesabın yok mu? Hemen ücretsiz hesap oluştur ve topluluğa katıl.'
              : 'Zaten bir hesabın var mı? Bilgilerinle hemen giriş yapabilirsin.'}
          </p>
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="px-8 py-2.5 rounded-full bg-gradient-to-r from-[#6D4AFF] to-[#5433FF] hover:opacity-95 active:scale-[0.98] text-white text-sm font-semibold shadow-md shadow-[#6D4AFF]/25 transition-all"
          >
            {mode === 'login' ? 'Kayıt Ol' : 'Giriş Yap'}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

export default AuthScreen;

