import React, { useState, useEffect, useRef } from 'react';
import {
  Hash,
  Volume2,
  Plus,
  Send,
  LogOut,
  Mic,
  MicOff,
  Headphones,
  MessageSquare,
  UserPlus,
  Users,
  Copy,
  Check
} from 'lucide-react';
import { AuthScreen, type AuthSuccessPayload } from './components/AuthScreen';
import { MarkdownView } from './components/MarkdownView';
import { GatewayClient } from '@strata/sdk';

interface User {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
}

interface Channel {
  id: string;
  name: string;
  type: string;
}

interface Guild {
  id: string;
  name: string;
  ownerId: string;
  memberCount?: number;
  channels?: Channel[];
}

interface GuildMemberInfo {
  userId: string;
  username: string;
  displayName: string | null;
  joinedAt: string;
}

interface Message {
  id: string;
  channelId: string;
  authorId: string;
  authorUsername?: string;
  authorDisplayName?: string | null;
  content: string;
  createdAt: string;
}

export function App() {
  const apiUrl = (import.meta.env.VITE_API_URL || 'https://strata-api-fy4r.onrender.com').replace(/\/+$/, '');
  const gatewayUrl =
    import.meta.env.VITE_GATEWAY_URL ||
    apiUrl.replace(/^http/, 'ws');

  const [authData, setAuthData] = useState<{ accessToken: string; refreshToken?: string; user: User } | null>(() => {
    try {
      const saved = localStorage.getItem('strata_auth');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [activeGuild, setActiveGuild] = useState<Guild | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [members, setMembers] = useState<GuildMemberInfo[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const [showCreateGuild, setShowCreateGuild] = useState(false);
  const [guildModalTab, setGuildModalTab] = useState<'create' | 'join'>('create');
  const [newGuildName, setNewGuildName] = useState('');
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const gatewayClientRef = useRef<GatewayClient | null>(null);

  // 1. Persist Auth State
  const handleAuthSuccess = (data: AuthSuccessPayload) => {
    const normalized = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: {
        id: data.user.id,
        username: data.user.username,
        displayName: data.user.displayName ?? null,
        email: data.user.email || ''
      }
    };
    setAuthData(normalized);
    localStorage.setItem('strata_auth', JSON.stringify(normalized));
  };

  const handleLogout = async () => {
    if (authData?.accessToken) {
      fetch(`${apiUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authData.accessToken}` }
      }).catch(() => {});
    }
    localStorage.removeItem('strata_auth');
    setAuthData(null);
    setGuilds([]);
    setActiveGuild(null);
    setChannels([]);
    setActiveChannel(null);
    setMessages([]);
    if (gatewayClientRef.current) {
      gatewayClientRef.current.disconnect();
    }
  };

  // Keep-Alive Ping for Cloud API (prevents Render Free Tier from sleeping)
  useEffect(() => {
    const ping = () => {
      fetch(`${apiUrl}/health/live`).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(timer);
  }, [apiUrl]);

  // Otomatik oturum doğrulama ve token yenileme
  useEffect(() => {
    if (!authData) return;

    const verifySession = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${authData.accessToken}` }
        });
        if (res.status === 401 && authData.refreshToken) {
          // Yenilemeyi dene
          const refreshRes = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: authData.refreshToken })
          });
          if (refreshRes.ok) {
            const refreshed = await refreshRes.json();
            const updated = {
              ...authData,
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken || authData.refreshToken
            };
            setAuthData(updated);
            localStorage.setItem('strata_auth', JSON.stringify(updated));
          } else {
            handleLogout();
          }
        } else if (res.status === 401 || res.status === 404) {
          handleLogout();
        }
      } catch {
        // Sunucu geçici olarak kapalıysa oturumu silme
      }
    };

    verifySession();
  }, []);

  // 2. Connect to WebSocket Gateway
  useEffect(() => {
    if (!authData) return;

    const client = new GatewayClient({
      url: gatewayUrl,
      token: authData.accessToken,
      reconnect: true
    });

    client.on('MESSAGE_CREATE', (newMsg: any) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    });

    client.connect();
    gatewayClientRef.current = client;

    return () => {
      client.disconnect();
    };
  }, [authData?.accessToken]);

  // 3. Load Guilds on Login
  useEffect(() => {
    if (!authData) return;

    const loadInitialData = async () => {
      try {
        const listRes = await fetch(`${apiUrl}/api/v1/users/@me/guilds`, {
          headers: { Authorization: `Bearer ${authData.accessToken}` }
        });

        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.guilds && listData.guilds.length > 0) {
            setGuilds(listData.guilds);
            setActiveGuild(listData.guilds[0]);
            return;
          }
        }

        // Hiç sunucu yoksa ilk varsayılan sunucuyu oluştur
        const createRes = await fetch(`${apiUrl}/api/v1/guilds`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authData.accessToken}`
          },
          body: JSON.stringify({ name: 'Strata Topluluk' })
        });

        if (createRes.ok) {
          const data = await createRes.json();
          setGuilds([data.guild]);
          setActiveGuild(data.guild);
        }
      } catch (err) {
        console.error('Sunucu yukleme hatasi:', err);
      }
    };

    loadInitialData();
  }, [authData?.accessToken]);

  // 4. Load Channels & Members when Active Guild Changes
  useEffect(() => {
    if (!authData || !activeGuild) return;
    setInviteCode(null);

    const fetchGuildDetails = async () => {
      try {
        const [chanRes, memRes] = await Promise.all([
          fetch(`${apiUrl}/api/v1/guilds/${activeGuild.id}/channels`, {
            headers: { Authorization: `Bearer ${authData.accessToken}` }
          }),
          fetch(`${apiUrl}/api/v1/guilds/${activeGuild.id}/members`, {
            headers: { Authorization: `Bearer ${authData.accessToken}` }
          })
        ]);

        if (chanRes.ok) {
          const data = await chanRes.json();
          setChannels(data.channels);
          const firstText = data.channels.find((c: Channel) => c.type === 'GUILD_TEXT');
          if (firstText) setActiveChannel(firstText);
        }

        if (memRes.ok) {
          const memData = await memRes.json();
          setMembers(memData.members || []);
        }
      } catch (err) {
        console.error('Kanal getirme hatasi:', err);
      }
    };

    fetchGuildDetails();
  }, [activeGuild?.id, authData?.accessToken]);

  // 5. Load Messages when Active Channel Changes (+ polling fallback for multi-user sync)
  useEffect(() => {
    if (!authData || !activeChannel) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/channels/${activeChannel.id}/messages`, {
          headers: { Authorization: `Bearer ${authData.accessToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages.reverse());
        }
      } catch (err) {
        console.error('Mesaj yukleme hatasi:', err);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 2500);
    return () => clearInterval(interval);
  }, [activeChannel?.id, authData?.accessToken]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // 6. Send Message Handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChannel || !authData) return;

    const textToSend = inputText.trim();
    setInputText('');

    try {
      const res = await fetch(`${apiUrl}/api/v1/channels/${activeChannel.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authData.accessToken}`
        },
        body: JSON.stringify({
          content: textToSend,
          nonce: Math.random().toString(36).substring(2)
        })
      });

      if (res.ok) {
        const newMsg = await res.json();
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
    } catch (err) {
      console.error('Mesaj gonderim hatasi:', err);
    }
  };

  // 7. Create or Join Guild Handler
  const handleGuildModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authData) return;
    setModalError(null);

    try {
      if (guildModalTab === 'create') {
        if (!newGuildName.trim()) return;
        const res = await fetch(`${apiUrl}/api/v1/guilds`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authData.accessToken}`
          },
          body: JSON.stringify({ name: newGuildName.trim() })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Sunucu oluşturulamadı.');

        setGuilds((prev) => [...prev, data.guild]);
        setActiveGuild(data.guild);
        setShowCreateGuild(false);
        setNewGuildName('');
      } else {
        if (!joinInviteCode.trim()) return;
        const res = await fetch(`${apiUrl}/api/v1/invites/${joinInviteCode.trim()}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authData.accessToken}`
          }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Davet kodu geçersiz.');

        setGuilds((prev) => {
          if (prev.some((g) => g.id === data.guild.id)) return prev;
          return [...prev, data.guild];
        });
        setActiveGuild(data.guild);
        setShowCreateGuild(false);
        setJoinInviteCode('');
      }
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'İşlem başarısız.');
    }
  };

  // 8. Create Invite Code for Friends
  const handleCreateInvite = async () => {
    if (!activeChannel || !authData) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/channels/${activeChannel.id}/invites`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authData.accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInviteCode(data.invite.code);
        navigator.clipboard?.writeText(data.invite.code).catch(() => {});
        setCopiedInvite(true);
        setTimeout(() => setCopiedInvite(false), 2500);
      }
    } catch (err) {
      console.error('Davet olusturma hatasi:', err);
    }
  };

  if (!authData) {
    return <AuthScreen apiUrl={apiUrl} onAuthSuccess={handleAuthSuccess} />;
  }

  const textChannels = channels.filter((c) => c.type === 'GUILD_TEXT');
  const voiceChannels = channels.filter((c) => c.type === 'GUILD_VOICE');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-strata-darkest text-strata-textNormal font-sans select-none">
      {/* 1. SÜTUN: SUNUCU ÇUBUĞU */}
      <div className="flex w-[72px] flex-col items-center gap-2 border-r border-strata-border/40 bg-strata-darkest py-3">
        <button
          onClick={() => {}}
          className="group relative flex h-12 w-12 items-center justify-center rounded-3xl bg-strata-panel text-indigo-400 transition-all duration-200 hover:rounded-2xl hover:bg-indigo-600 hover:text-white"
          title="Strata Ana Sayfa"
        >
          <MessageSquare className="h-6 w-6" />
        </button>

        <div className="my-1 h-[2px] w-8 rounded-full bg-strata-border/60" />

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto no-scrollbar">
          {guilds.map((g) => {
            const isActive = activeGuild?.id === g.id;
            const initials = g.name
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            return (
              <button
                key={g.id}
                onClick={() => setActiveGuild(g)}
                className={`group relative flex h-12 w-12 items-center justify-center font-bold transition-all duration-200 ${
                  isActive
                    ? 'rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'rounded-3xl bg-strata-panel text-strata-textNormal hover:rounded-2xl hover:bg-indigo-600 hover:text-white'
                }`}
                title={g.name}
              >
                {initials}
              </button>
            );
          })}

          <button
            onClick={() => {
              setModalError(null);
              setShowCreateGuild(true);
            }}
            className="group flex h-12 w-12 items-center justify-center rounded-3xl bg-strata-panel text-emerald-400 transition-all duration-200 hover:rounded-2xl hover:bg-emerald-600 hover:text-white"
            title="Sunucu Oluştur veya Katıl"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* 2. SÜTUN: KANAL SÜTUNU & KULLANICI PROFİLİ */}
      <div className="flex w-60 flex-col border-r border-strata-border/40 bg-strata-darker">
        <div className="flex h-12 items-center justify-between border-b border-strata-border/40 px-4 font-bold shadow-sm">
          <span className="truncate text-sm text-white">{activeGuild?.name || 'Strata'}</span>
          <button
            onClick={handleCreateInvite}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-strata-panel transition-colors"
            title="Arkadaşlarını Davet Et (Kod Oluştur)"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        </div>

        {inviteCode && (
          <div className="mx-3 mt-2 rounded-xl bg-indigo-600/15 border border-indigo-500/30 p-2.5 text-xs">
            <div className="flex items-center justify-between text-indigo-300 font-semibold mb-1">
              <span>Davet Kodu Hazır!</span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(inviteCode);
                  setCopiedInvite(true);
                  setTimeout(() => setCopiedInvite(false), 2000);
                }}
                className="flex items-center gap-1 text-[11px] hover:text-white"
              >
                {copiedInvite ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedInvite ? 'Kopyalandı' : 'Kopyala'}
              </button>
            </div>
            <div className="font-mono text-white bg-black/30 rounded px-2 py-1 text-center tracking-wider select-all">
              {inviteCode}
            </div>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto p-3 text-xs">
          <div>
            <div className="mb-1 px-1 font-semibold uppercase tracking-wider text-strata-textMuted">
              Metin Kanalları
            </div>
            <div className="space-y-0.5">
              {textChannels.map((c) => {
                const isActive = activeChannel?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveChannel(c)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-600/20 text-indigo-300'
                        : 'text-strata-textMuted hover:bg-strata-panel/50 hover:text-strata-textNormal'
                    }`}
                  >
                    <Hash className="h-4 w-4 shrink-0 text-zinc-400" />
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {voiceChannels.length > 0 && (
            <div>
              <div className="mb-1 px-1 font-semibold uppercase tracking-wider text-strata-textMuted">
                Ses Kanalları
              </div>
              <div className="space-y-0.5">
                {voiceChannels.map((c) => (
                  <button
                    key={c.id}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-strata-textMuted hover:bg-strata-panel/50 hover:text-strata-textNormal transition-colors"
                  >
                    <Volume2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Kullanıcı Paneli */}
        <div className="flex h-14 items-center justify-between border-t border-strata-border/40 bg-strata-darkest/70 px-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 font-bold text-white text-xs shrink-0">
              {authData.user.username.slice(0, 2).toUpperCase()}
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-strata-darkest" />
            </div>
            <div className="truncate text-xs">
              <div className="font-semibold text-white truncate">
                {authData.user.displayName || authData.user.username}
              </div>
              <div className="text-[10px] text-zinc-500 truncate">@{authData.user.username}</div>
            </div>
          </div>

          <div className="flex items-center gap-1 text-zinc-400">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-1.5 rounded hover:bg-strata-panel transition-colors ${isMuted ? 'text-red-400' : ''}`}
              title={isMuted ? 'Mikrofonu Aç' : 'Mikrofonu Kapat'}
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setIsDeafened(!isDeafened)}
              className={`p-1.5 rounded hover:bg-strata-panel transition-colors ${isDeafened ? 'text-red-400' : ''}`}
              title={isDeafened ? 'Sağırlaştırmayı Kapat' : 'Sağırlaştır'}
            >
              <Headphones className="h-4 w-4" />
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded hover:bg-strata-panel hover:text-red-400 transition-colors"
              title="Çıkış Yap"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. SÜTUN: SOHBET VE MESAJ ALANI */}
      <div className="flex flex-1 flex-col bg-strata-dark">
        <div className="flex h-12 items-center justify-between border-b border-strata-border/40 px-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-zinc-400" />
            <span className="font-bold text-white text-sm">{activeChannel?.name || 'genel'}</span>
            <span className="text-xs text-strata-textMuted border-l border-zinc-700 pl-2 ml-2">
              {activeGuild?.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Users className="h-4 w-4" />
            <span>{members.length || 1} Üye</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-strata-textMuted">
              <MessageSquare className="h-12 w-12 text-zinc-700 mb-2" />
              <p className="text-base font-semibold text-white">#{activeChannel?.name || 'genel'} kanalına hoş geldin!</p>
              <p className="text-xs">İlk mesajı gönderen sen ol.</p>
            </div>
          ) : (
            messages.map((m) => {
              const timeStr = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const isMine = m.authorId === authData.user.id;
              const authorLabel = isMine
                ? authData.user.displayName || authData.user.username
                : m.authorDisplayName || m.authorUsername || `Kullanıcı_${m.authorId.slice(-4)}`;
              const avatarInitials = authorLabel.slice(0, 2).toUpperCase();

              return (
                <div key={m.id} className="group flex gap-3 hover:bg-strata-panel/20 p-1.5 rounded-lg -mx-1.5 transition-colors">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 font-bold text-white text-sm">
                    {avatarInitials}
                  </div>

                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{authorLabel}</span>
                      <span className="text-[11px] text-zinc-500">{timeStr}</span>
                    </div>

                    <div className="mt-1 text-strata-textNormal">
                      <MarkdownView content={m.content} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 pt-0">
          <form onSubmit={handleSendMessage} className="relative flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`#${activeChannel?.name || 'genel'} kanalına mesaj gönder...`}
              className="w-full rounded-2xl border border-strata-border/60 bg-strata-panel/70 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none pr-12 shadow-inner"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white transition-all hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* 4. SÜTUN: ÜYE LİSTESİ */}
      <div className="hidden lg:flex w-56 flex-col border-l border-strata-border/40 bg-strata-darker p-3">
        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-strata-textMuted">
          Üyeler — {members.length || 1}
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {members.map((mem) => (
            <div
              key={mem.userId}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-strata-panel/40 transition-colors"
            >
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600/80 text-xs font-bold text-white shrink-0">
                {(mem.displayName || mem.username).slice(0, 2).toUpperCase()}
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-strata-darker" />
              </div>
              <div className="truncate">
                <div className="text-xs font-medium text-white truncate">
                  {mem.displayName || mem.username}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">@{mem.username}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sunucu Oluştur / Katıl Modal */}
      {showCreateGuild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-strata-border bg-strata-panel p-6 shadow-2xl">
            <div className="flex gap-2 mb-4 bg-strata-darkest p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setGuildModalTab('create');
                  setModalError(null);
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  guildModalTab === 'create' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Sunucu Oluştur
              </button>
              <button
                type="button"
                onClick={() => {
                  setGuildModalTab('join');
                  setModalError(null);
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  guildModalTab === 'join' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Davet İle Katıl
              </button>
            </div>

            {modalError && (
              <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/30 p-2 text-xs text-red-400 text-center">
                {modalError}
              </div>
            )}

            <form onSubmit={handleGuildModalSubmit} className="space-y-4">
              {guildModalTab === 'create' ? (
                <div>
                  <label className="text-xs font-semibold uppercase text-strata-textMuted">Sunucu Adı</label>
                  <input
                    type="text"
                    required
                    value={newGuildName}
                    onChange={(e) => setNewGuildName(e.target.value)}
                    placeholder="Örn: Oyun Grubu"
                    className="mt-1 w-full rounded-xl border border-strata-border bg-strata-darkest px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold uppercase text-strata-textMuted">Davet Kodu</label>
                  <input
                    type="text"
                    required
                    value={joinInviteCode}
                    onChange={(e) => setJoinInviteCode(e.target.value)}
                    placeholder="Örn: a8f3k9x2"
                    className="mt-1 w-full rounded-xl border border-strata-border bg-strata-darkest px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGuild(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/30"
                >
                  {guildModalTab === 'create' ? 'Oluştur' : 'Katıl'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
