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
  Check,
  Trash2,
  Edit3,
  CornerUpLeft,
  ChevronDown,
  PhoneOff,
  Sparkles,
  X
} from 'lucide-react';
import { AuthScreen, type AuthSuccessPayload } from './components/AuthScreen';
import { MarkdownView } from './components/MarkdownView';
import { Titlebar } from './components/Titlebar';
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
  editedAt?: string | null;
  createdAt: string;
}

export function App() {
  const apiUrl = (import.meta.env.VITE_API_URL || 'https://strata-api-fy4r.onrender.com').replace(/\/+$/, '');
  const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || apiUrl.replace(/^http/, 'ws');

  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('strata_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    localStorage.setItem('strata_theme', dark ? 'dark' : 'light');
    document.documentElement.style.backgroundColor = dark ? '#18181B' : '#F3F4F6';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [dark]);

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

  // Voice & UI states
  const [activeVoiceChannel, setActiveVoiceChannel] = useState<Channel | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);

  // Message reply & edit states
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Modals
  const [showGuildDropdown, setShowGuildDropdown] = useState(false);
  const [showCreateGuildModal, setShowCreateGuildModal] = useState(false);
  const [newGuildName, setNewGuildName] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'GUILD_TEXT' | 'GUILD_VOICE'>('GUILD_TEXT');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const activeGuildIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeChannelIdRef.current = activeChannel?.id || null;
  }, [activeChannel]);

  useEffect(() => {
    activeGuildIdRef.current = activeGuild?.id || null;
  }, [activeGuild]);

  const handleAuthSuccess = (payload: AuthSuccessPayload) => {
    const session = {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      user: payload.user
    };
    localStorage.setItem('strata_auth', JSON.stringify(session));
    setAuthData(session);
  };

  const handleLogout = () => {
    localStorage.removeItem('strata_auth');
    setAuthData(null);
    setGuilds([]);
    setActiveGuild(null);
    setChannels([]);
    setActiveChannel(null);
    setMessages([]);
  };

  // Realtime WebSocket
  useEffect(() => {
    if (!authData?.accessToken) return;

    const wsUrl = `${gatewayUrl.replace(/\/+$/, '')}/ws`;
    const client = new GatewayClient({
      url: wsUrl,
      token: authData.accessToken
    });

    client.on('open', () => setWsConnected(true));
    client.on('close', () => setWsConnected(false));

    client.on('dispatch', (event: string, data: any) => {
      if (event === 'MESSAGE_CREATE') {
        const msg = data as Message;
        if (msg.channelId === activeChannelIdRef.current) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
      } else if (event === 'CHANNEL_CREATE') {
        const { guildId, channel } = data as { guildId: string; channel: Channel };
        if (guildId === activeGuildIdRef.current) {
          setChannels((prev) => (prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]));
        }
      } else if (event === 'GUILD_MEMBER_ADD') {
        const { guildId } = data as { guildId: string };
        if (guildId === activeGuildIdRef.current) {
          fetchGuildMembers(guildId);
        }
      }
    });

    client.connect();
    return () => client.disconnect();
  }, [authData?.accessToken, gatewayUrl]);

  const fetchGuilds = async () => {
    if (!authData?.accessToken) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/guilds`, {
        headers: { Authorization: `Bearer ${authData.accessToken}` }
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      const data = await res.json();
      if (data.guilds && Array.isArray(data.guilds)) {
        setGuilds(data.guilds);
        if (data.guilds.length > 0 && !activeGuild) {
          selectGuild(data.guilds[0]);
        }
      }
    } catch (err) {
      console.error('Alanlar yüklenemedi:', err);
    }
  };

  const fetchGuildMembers = async (guildId: string) => {
    if (!authData?.accessToken) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/guilds/${guildId}/members`, {
        headers: { Authorization: `Bearer ${authData.accessToken}` }
      });
      const data = await res.json();
      if (data.members && Array.isArray(data.members)) {
        setMembers(data.members);
      }
    } catch {}
  };

  const selectGuild = async (guild: Guild) => {
    setActiveGuild(guild);
    setShowGuildDropdown(false);
    setGeneratedInvite(null);
    if (!authData?.accessToken) return;

    fetchGuildMembers(guild.id);

    try {
      const res = await fetch(`${apiUrl}/api/v1/guilds/${guild.id}/channels`, {
        headers: { Authorization: `Bearer ${authData.accessToken}` }
      });
      const data = await res.json();
      const chList: Channel[] = data.channels || guild.channels || [];
      setChannels(chList);
      const firstText = chList.find((c) => c.type === 'GUILD_TEXT') || chList[0] || null;
      setActiveChannel(firstText);
    } catch {
      const chList = guild.channels || [];
      setChannels(chList);
      setActiveChannel(chList[0] || null);
    }
  };

  const fetchMessages = async (channelId: string) => {
    if (!authData?.accessToken) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/channels/${channelId}/messages?limit=50`, {
        headers: { Authorization: `Bearer ${authData.accessToken}` }
      });
      const data = await res.json();
      if (data.messages && Array.isArray(data.messages)) {
        setMessages([...data.messages].reverse());
      }
    } catch {}
  };

  useEffect(() => {
    if (authData?.accessToken) {
      fetchGuilds();
    }
  }, [authData?.accessToken]);

  useEffect(() => {
    if (activeChannel && activeChannel.type === 'GUILD_TEXT') {
      fetchMessages(activeChannel.id);
    }
  }, [activeChannel?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChannel || !authData?.accessToken) return;

    const rawText = inputText.trim();
    const content = replyingTo
      ? `> **@${replyingTo.authorDisplayName || replyingTo.authorUsername}**: ${replyingTo.content.slice(0, 80)}\n${rawText}`
      : rawText;

    setInputText('');
    setReplyingTo(null);

    try {
      const res = await fetch(`${apiUrl}/api/v1/channels/${activeChannel.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authData.accessToken}`
        },
        body: JSON.stringify({ content, nonce: `${Date.now()}` })
      });
      if (res.ok) {
        const newMsg = await res.json();
        setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
      }
    } catch {}
  };

  const handleEditMessage = async (msgId: string) => {
    if (!editContent.trim() || !activeChannel || !authData?.accessToken) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/channels/${activeChannel.id}/messages/${msgId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authData.accessToken}`
        },
        body: JSON.stringify({ content: editContent.trim() })
      });
      if (res.ok) {
        const updated = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, content: updated.content, editedAt: updated.editedAt } : m))
        );
        setEditingMessageId(null);
      }
    } catch {}
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!activeChannel || !authData?.accessToken) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/channels/${activeChannel.id}/messages/${msgId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authData.accessToken}` }
      });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
      }
    } catch {}
  };

  const handleCreateGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuildName.trim() || !authData?.accessToken) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/guilds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authData.accessToken}`
        },
        body: JSON.stringify({ name: newGuildName.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        const created = data.guild;
        setGuilds((prev) => [...prev, created]);
        setNewGuildName('');
        setShowCreateGuildModal(false);
        selectGuild(created);
      }
    } catch {}
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || !activeGuild || !authData?.accessToken) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/guilds/${activeGuild.id}/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authData.accessToken}`
        },
        body: JSON.stringify({ name: newChannelName.trim(), type: newChannelType })
      });
      if (res.ok) {
        const data = await res.json();
        const ch = data.channel;
        setChannels((prev) => (prev.some((c) => c.id === ch.id) ? prev : [...prev, ch]));
        setNewChannelName('');
        setShowCreateChannelModal(false);
        if (ch.type === 'GUILD_TEXT') setActiveChannel(ch);
      }
    } catch {}
  };

  const handleCreateInvite = async () => {
    if (!activeChannel || !authData?.accessToken) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/channels/${activeChannel.id}/invites`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authData.accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedInvite(data.invite?.code || null);
      }
    } catch {}
  };

  const handleJoinViaInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim() || !authData?.accessToken) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/invites/${inviteCodeInput.trim()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authData.accessToken}` }
      });
      const data = await res.json();
      if (res.ok && data.guild) {
        setGuilds((prev) => (prev.some((g) => g.id === data.guild.id) ? prev : [...prev, data.guild]));
        setInviteCodeInput('');
        setShowJoinModal(false);
        selectGuild(data.guild);
      }
    } catch {}
  };

  if (!authData) {
    return <AuthScreen apiUrl={apiUrl} onAuthSuccess={handleAuthSuccess} />;
  }

  const textChannels = channels.filter((c) => c.type === 'GUILD_TEXT');
  const voiceChannels = channels.filter((c) => c.type === 'GUILD_VOICE');

  return (
    <div
      className={`h-screen w-screen overflow-hidden flex flex-col select-none transition-colors duration-200 ${
        dark ? 'bg-[#18181B] text-zinc-100' : 'bg-[#F3F4F6] text-zinc-900'
      }`}
    >
      {/* Uygulama Rengiyle Bütünleşik Üst Pencere Çubuğu */}
      <Titlebar
        dark={dark}
        onToggleTheme={() => setDark((d) => !d)}
        title={activeGuild ? `Strata — ${activeGuild.name}` : 'Strata'}
      />

      {/* Ana Çalışma Alanı (Modern, Discord Kopyası Olmayan Yuvarlatılmış Panel Mimarisi) */}
      <div className="flex-1 flex gap-2.5 p-2.5 pt-1 overflow-hidden">
        {/* SOL PANEL: Çalışma Alanı Seçici + Odalar + Profil Kartı */}
        <aside
          className={`w-68 rounded-2xl flex flex-col shrink-0 border transition-colors ${
            dark ? 'bg-[#202024] border-white/[0.06]' : 'bg-white border-zinc-200/80 shadow-xs'
          }`}
        >
          {/* Üst: Topluluk / Çalışma Alanı Seçici Dropdown */}
          <div className="relative p-3 border-b border-inherit">
            <button
              type="button"
              onClick={() => setShowGuildDropdown((v) => !v)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${
                dark ? 'bg-[#27272C] hover:bg-[#2E2E35]' : 'bg-zinc-100 hover:bg-zinc-200/70'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6D4AFF] to-[#5433FF] text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                  {activeGuild?.name?.slice(0, 2).toUpperCase() || 'ST'}
                </div>
                <div className="text-left min-w-0">
                  <div className="text-sm font-bold truncate">{activeGuild?.name || 'Alan Seçin'}</div>
                  <div className="text-[11px] opacity-60 flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span>{members.length || 1} üye</span>
                  </div>
                </div>
              </div>
              <ChevronDown size={16} className="opacity-60 shrink-0" />
            </button>

            {/* Topluluk Değiştirme & Oluşturma Menüsü */}
            {showGuildDropdown && (
              <div
                className={`absolute left-3 right-3 top-16 z-30 rounded-xl p-2 border shadow-xl ${
                  dark ? 'bg-[#27272C] border-white/10' : 'bg-white border-zinc-200'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-50 px-2 py-1">
                  Topluluk Alanların
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1 my-1">
                  {guilds.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => selectGuild(g)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        activeGuild?.id === g.id
                          ? 'bg-[#6D4AFF] text-white'
                          : dark
                          ? 'hover:bg-white/5 text-zinc-200'
                          : 'hover:bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      <span className="w-6 h-6 rounded-md bg-black/20 flex items-center justify-center text-[10px] font-bold">
                        {g.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="truncate">{g.name}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-inherit pt-1.5 mt-1 flex flex-col gap-1">
                  <button
                    onClick={() => {
                      setShowGuildDropdown(false);
                      setShowCreateGuildModal(true);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6D4AFF] hover:bg-[#6D4AFF]/10 transition-colors"
                  >
                    <Plus size={14} /> Yeni Topluluk Oluştur
                  </button>
                  <button
                    onClick={() => {
                      setShowGuildDropdown(false);
                      setShowJoinModal(true);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                  >
                    <UserPlus size={14} /> Davet Koduyla Katıl
                  </button>
                </div>
              </div>
            )}

            {/* Hızlı Davet Kodu Barı */}
            <div className="mt-2 flex items-center gap-1.5">
              <button
                onClick={handleCreateInvite}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                  dark ? 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                }`}
              >
                <UserPlus size={13} className="text-[#6D4AFF]" />
                <span>Arkadaş Davet Et</span>
              </button>
              <button
                onClick={() => setShowCreateChannelModal(true)}
                className={`p-1.5 rounded-lg transition-colors ${
                  dark ? 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                }`}
                title="Yeni Oda Ekle"
              >
                <Plus size={15} />
              </button>
            </div>

            {generatedInvite && (
              <div className="mt-2 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#6D4AFF]/15 border border-[#6D4AFF]/30 text-xs">
                <span className="font-mono font-bold text-[#6D4AFF]">{generatedInvite}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedInvite);
                    setCopiedInvite(true);
                    setTimeout(() => setCopiedInvite(false), 2000);
                  }}
                  className="text-xs flex items-center gap-1 text-[#6D4AFF] hover:underline"
                >
                  {copiedInvite ? <Check size={13} /> : <Copy size={13} />}
                  {copiedInvite ? 'Kopyalandı' : 'Kopyala'}
                </button>
              </div>
            )}
          </div>

          {/* Orta: Sohbet Odaları ve Ses Odaları */}
          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {/* Yazılı Odalar */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-50">Sohbet Odaları</span>
              </div>
              <div className="space-y-1">
                {textChannels.map((channel) => {
                  const isActive = activeChannel?.id === channel.id;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => setActiveChannel(channel)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-[#6D4AFF] to-[#5433FF] text-white shadow-sm shadow-[#6D4AFF]/25'
                          : dark
                          ? 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                      }`}
                    >
                      <Hash size={16} className={isActive ? 'text-white' : 'opacity-60'} />
                      <span className="truncate">{channel.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sesli Odalar */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-50">Sesli Odalar</span>
              </div>
              <div className="space-y-1">
                {voiceChannels.map((channel) => {
                  const isConnected = activeVoiceChannel?.id === channel.id;
                  return (
                    <div key={channel.id} className="space-y-1">
                      <button
                        onClick={() => setActiveVoiceChannel(isConnected ? null : channel)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                          isConnected
                            ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                            : dark
                            ? 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Volume2 size={16} className={isConnected ? 'text-emerald-500 animate-pulse' : 'opacity-60'} />
                          <span className="truncate">{channel.name}</span>
                        </div>
                        {isConnected && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20">Canlı</span>}
                      </button>

                      {isConnected && (
                        <div className="pl-6 pr-2 py-1 flex items-center gap-2 text-xs opacity-85">
                          <div className="w-5 h-5 rounded-full bg-[#6D4AFF] text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-emerald-500">
                            {(authData.user.displayName || authData.user.username).slice(0, 1).toUpperCase()}
                          </div>
                          <span className="truncate font-medium">{authData.user.displayName || authData.user.username}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Aktif Ses Bağlantısı Durum Barı */}
          {activeVoiceChannel && (
            <div className="mx-3 mb-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-xs font-bold text-emerald-500">Ses Bağlantısı Aktif</div>
                <div className="text-[11px] opacity-70 truncate">{activeVoiceChannel.name} • 22 ms</div>
              </div>
              <button
                onClick={() => setActiveVoiceChannel(null)}
                className="p-1.5 rounded-lg bg-red-500/15 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                title="Bağlantıyı Kes"
              >
                <PhoneOff size={14} />
              </button>
            </div>
          )}

          {/* Alt: Kullanıcı Profil Kartı */}
          <div
            className={`p-3 border-t border-inherit flex items-center justify-between ${
              dark ? 'bg-[#1B1B1F]/60' : 'bg-zinc-50/80'
            } rounded-b-2xl`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6D4AFF] to-[#5433FF] flex items-center justify-center text-white font-bold text-sm">
                  {(authData.user.displayName || authData.user.username).slice(0, 2).toUpperCase()}
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#202024] absolute -bottom-0.5 -right-0.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">{authData.user.displayName || authData.user.username}</div>
                <div className="text-[11px] opacity-55 truncate">@{authData.user.username}</div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isMuted ? 'bg-red-500/15 text-red-500' : 'opacity-70 hover:opacity-100 hover:bg-black/5'
                }`}
                title={isMuted ? 'Mikrofonu Aç' : 'Mikrofonu Kapat'}
              >
                {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              <button
                onClick={() => setIsDeafened(!isDeafened)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDeafened ? 'bg-red-500/15 text-red-500' : 'opacity-70 hover:opacity-100 hover:bg-black/5'
                }`}
                title="Kulaklık"
              >
                <Headphones size={15} />
              </button>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg opacity-70 hover:opacity-100 hover:text-red-500 transition-colors"
                title="Çıkış Yap"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        {/* ORTA PANEL: Ana Sohbet & Etkileşim Sahnesi */}
        <main
          className={`flex-1 rounded-2xl flex flex-col overflow-hidden border transition-colors ${
            dark ? 'bg-[#202024] border-white/[0.06]' : 'bg-white border-zinc-200/80 shadow-xs'
          }`}
        >
          {/* Sohbet Üst Başlığı */}
          <header className="h-14 px-5 border-b border-inherit flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#6D4AFF]/15 text-[#6D4AFF] flex items-center justify-center">
                <Hash size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold">{activeChannel?.name || 'genel'}</h2>
                <p className="text-[11px] opacity-55">
                  {activeGuild?.name} • Gerçek zamanlı mesajlaşma aktif
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMembers((s) => !s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  showMembers
                    ? 'bg-[#6D4AFF]/15 text-[#6D4AFF]'
                    : dark
                    ? 'hover:bg-white/5 text-zinc-400'
                    : 'hover:bg-zinc-100 text-zinc-600'
                }`}
              >
                <Users size={15} />
                <span>Üyeler ({members.length || 1})</span>
              </button>
            </div>
          </header>

          {/* Mesaj Akışı */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                <div className="w-12 h-12 rounded-2xl bg-[#6D4AFF]/15 text-[#6D4AFF] flex items-center justify-center mb-3">
                  <Sparkles size={24} />
                </div>
                <p className="text-base font-bold">#{activeChannel?.name} odasına hoş geldin!</p>
                <p className="text-xs mt-1 max-w-xs">İlk mesajı göndererek sohbeti başlatabilirsin.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.authorId === authData.user.id;
                const displayName =
                  msg.authorDisplayName ||
                  msg.authorUsername ||
                  (isMine ? authData.user.displayName || authData.user.username : 'Kullanıcı');

                return (
                  <div
                    key={msg.id}
                    className={`group flex items-start gap-3 p-3 rounded-2xl transition-colors ${
                      dark ? 'hover:bg-white/[0.03]' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6D4AFF] to-[#5433FF] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-bold">{displayName}</span>
                        <span className="text-[10px] opacity-45">
                          {new Date(msg.createdAt).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {msg.editedAt && <span className="text-[10px] opacity-45">(düzenlendi)</span>}
                      </div>

                      {editingMessageId === msg.id ? (
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            type="text"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleEditMessage(msg.id);
                              if (e.key === 'Escape') setEditingMessageId(null);
                            }}
                            className={`flex-1 px-3 py-1.5 rounded-lg text-xs outline-none border ${
                              dark ? 'bg-[#18181B] border-white/15 text-white' : 'bg-white border-zinc-300 text-zinc-900'
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={() => handleEditMessage(msg.id)}
                            className="px-2.5 py-1 rounded-lg bg-[#6D4AFF] text-white text-xs font-medium"
                          >
                            Kaydet
                          </button>
                          <button
                            onClick={() => setEditingMessageId(null)}
                            className="px-2 py-1 text-xs opacity-60 hover:opacity-100"
                          >
                            İptal
                          </button>
                        </div>
                      ) : (
                        <div className="text-sm mt-0.5 leading-relaxed break-words">
                          <MarkdownView content={msg.content} />
                        </div>
                      )}
                    </div>

                    {/* Mesaj Aksiyon Butonları (Yanıtla, Düzenle, Sil) */}
                    <div
                      className={`opacity-0 group-hover:opacity-100 flex items-center gap-1 px-1.5 py-1 rounded-lg border transition-opacity ${
                        dark ? 'bg-[#27272C] border-white/10' : 'bg-white border-zinc-200 shadow-2xs'
                      }`}
                    >
                      <button
                        onClick={() => setReplyingTo(msg)}
                        className="p-1 rounded hover:bg-black/10 opacity-75 hover:opacity-100"
                        title="Yanıtla"
                      >
                        <CornerUpLeft size={13} />
                      </button>
                      {isMine && (
                        <>
                          <button
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditContent(msg.content);
                            }}
                            className="p-1 rounded hover:bg-black/10 opacity-75 hover:opacity-100"
                            title="Düzenle"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-1 rounded hover:bg-red-500/15 text-red-500"
                            title="Sil"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Yanıtlama Göstergesi */}
          {replyingTo && (
            <div className="mx-4 mb-1 px-3 py-1.5 rounded-t-xl bg-[#6D4AFF]/10 border border-b-0 border-[#6D4AFF]/25 flex items-center justify-between text-xs">
              <span className="truncate">
                <strong className="text-[#6D4AFF]">@{replyingTo.authorDisplayName || replyingTo.authorUsername}</strong> kişisine yanıt veriliyor
              </span>
              <button onClick={() => setReplyingTo(null)} className="opacity-60 hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Mesaj Yazma Kutusu */}
          <form onSubmit={handleSendMessage} className="p-4 pt-2">
            <div
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-colors ${
                dark
                  ? 'bg-[#18181B] border-white/[0.08] focus-within:border-[#6D4AFF]'
                  : 'bg-zinc-100/80 border-zinc-200 focus-within:border-[#6D4AFF] focus-within:bg-white'
              }`}
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`#${activeChannel?.name || 'genel'} odasına mesaj yaz...`}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="p-2 rounded-xl bg-gradient-to-r from-[#6D4AFF] to-[#5433FF] text-white disabled:opacity-40 transition-opacity"
              >
                <Send size={15} />
              </button>
            </div>
          </form>
        </main>

        {/* SAĞ PANEL: Topluluk Üyeleri */}
        {showMembers && (
          <aside
            className={`w-60 rounded-2xl p-3 flex flex-col shrink-0 border transition-colors ${
              dark ? 'bg-[#202024] border-white/[0.06]' : 'bg-white border-zinc-200/80 shadow-xs'
            }`}
          >
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-50 px-2 py-1.5">
              Topluluk Üyeleri — {members.length || 1}
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 mt-1">
              {members.map((m) => (
                <div
                  key={m.userId}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors ${
                    dark ? 'hover:bg-white/[0.04]' : 'hover:bg-zinc-100'
                  }`}
                >
                  <div className="relative">
                    <div className="w-8 h-8 rounded-xl bg-[#6D4AFF]/20 text-[#6D4AFF] font-bold text-xs flex items-center justify-center">
                      {(m.displayName || m.username).slice(0, 2).toUpperCase()}
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#202024] absolute -bottom-0.5 -right-0.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{m.displayName || m.username}</div>
                    <div className="text-[10px] opacity-50 truncate">@{m.username}</div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Yeni Topluluk Modalı */}
      {showCreateGuildModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className={`w-full max-w-sm rounded-2xl p-6 border ${dark ? 'bg-[#202024] border-white/10' : 'bg-white border-zinc-200'}`}>
            <h3 className="text-base font-bold mb-4">Yeni Topluluk Alanı Oluştur</h3>
            <form onSubmit={handleCreateGuild} className="space-y-4">
              <input
                type="text"
                value={newGuildName}
                onChange={(e) => setNewGuildName(e.target.value)}
                placeholder="Örn: Tasarım Ekibi"
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none ${
                  dark ? 'bg-[#18181B] border-white/10' : 'bg-zinc-50 border-zinc-300'
                }`}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreateGuildModal(false)} className="px-4 py-2 text-xs font-medium opacity-70">
                  İptal
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-[#6D4AFF] text-white text-xs font-semibold">
                  Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Davet İle Katıl Modalı */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className={`w-full max-w-sm rounded-2xl p-6 border ${dark ? 'bg-[#202024] border-white/10' : 'bg-white border-zinc-200'}`}>
            <h3 className="text-base font-bold mb-4">Davet Kodu ile Katıl</h3>
            <form onSubmit={handleJoinViaInvite} className="space-y-4">
              <input
                type="text"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                placeholder="Davet kodunu yapıştırın"
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none ${
                  dark ? 'bg-[#18181B] border-white/10' : 'bg-zinc-50 border-zinc-300'
                }`}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowJoinModal(false)} className="px-4 py-2 text-xs font-medium opacity-70">
                  İptal
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold">
                  Katıl
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Yeni Oda Oluştur Modalı */}
      {showCreateChannelModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className={`w-full max-w-sm rounded-2xl p-6 border ${dark ? 'bg-[#202024] border-white/10' : 'bg-white border-zinc-200'}`}>
            <h3 className="text-base font-bold mb-4">Yeni Oda Ekle</h3>
            <form onSubmit={handleCreateChannel} className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewChannelType('GUILD_TEXT')}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                    newChannelType === 'GUILD_TEXT' ? 'border-[#6D4AFF] bg-[#6D4AFF]/15 text-[#6D4AFF]' : 'border-transparent opacity-60'
                  }`}
                >
                  # Yazılı Oda
                </button>
                <button
                  type="button"
                  onClick={() => setNewChannelType('GUILD_VOICE')}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                    newChannelType === 'GUILD_VOICE' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500' : 'border-transparent opacity-60'
                  }`}
                >
                  🔊 Sesli Oda
                </button>
              </div>
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="oda-adi"
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none ${
                  dark ? 'bg-[#18181B] border-white/10' : 'bg-zinc-50 border-zinc-300'
                }`}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreateChannelModal(false)} className="px-4 py-2 text-xs font-medium opacity-70">
                  İptal
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-[#6D4AFF] text-white text-xs font-semibold">
                  Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

