"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingSpinner, SkeletonLine } from "@/app/components/LoadingSpinner";
import { getGreetingBahia } from "@/lib/greeting";
import { speakLoginGreetingOnce } from "@/lib/voice-greeting";
import { getRealtimeClient, DASHBOARD_CHANNEL, DashboardEvent } from "@/lib/realtime";

import { SUBJECTS, getSubjectLabel } from "@/lib/subjects";

interface ReplyDTO {
  id: string;
  text: string;
  createdAt: string;
  sentToWhatsApp: boolean;
  whatsappError: string | null;
  isAiGenerated: boolean;
  matchedScore: number | null;
  adminUser: { username: string };
}

interface QuestionDTO {
  id: string;
  name: string;
  phone: string;
  subject: string;
  message: string;
  status: "pending" | "answered";
  resolvedBy: "admin" | "ai" | null;
  createdAt: string;
  lastInboundAt: string;
  replies: ReplyDTO[];
}

interface AdminUserDTO {
  id: string;
  username: string;
  isMaster: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDisplayName(username: string): string {
  return username
    .toLowerCase()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

function isSessionExpired(lastInboundAt: string): boolean {
  return Date.now() - new Date(lastInboundAt).getTime() > SESSION_WINDOW_MS;
}

export function DashboardClient({
  currentUser,
}: {
  currentUser: { username: string; isMaster: boolean };
}) {
  const router = useRouter();
  const [greeting, setGreeting] = useState(getGreetingBahia());
  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [mobileShowConversation, setMobileShowConversation] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "answered">("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");

  const [showUserModal, setShowUserModal] = useState(false);
  const [admins, setAdmins] = useState<AdminUserDTO[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState("");

  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "offline">("connecting");

  const conversationEndRef = useRef<HTMLDivElement>(null);

  const fetchQuestions = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const res = await fetch("/api/questions", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setQuestions(data.questions);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const interval = setInterval(() => setGreeting(getGreetingBahia()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    speakLoginGreetingOnce(toDisplayName(currentUser.username));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevSelectedIdRef = useRef<string | null>(null);
  const prevReplyCountRef = useRef<number>(0);

  useEffect(() => {
    fetchQuestions(true);
    // Com o tempo real ativo, o polling vira só uma rede de segurança —
    // por isso o intervalo passou de 6s para 20s.
    const interval = setInterval(() => fetchQuestions(false), 20000);
    return () => clearInterval(interval);
  }, [fetchQuestions]);

  function pushToast(text: string) {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }

  useEffect(() => {
    const client = getRealtimeClient();
    if (!client) {
      // Sem NEXT_PUBLIC_SUPABASE_URL/ANON_KEY configurados -> segue só no
      // polling de 20s, sem quebrar nada.
      setLiveStatus("offline");
      return;
    }

    const channel = client.channel(DASHBOARD_CHANNEL);

    channel
      .on("broadcast", { event: "update" }, (message) => {
        const payload = message.payload as DashboardEvent;
        fetchQuestions(false);

        if (payload?.type === "question_created") {
          pushToast(`🆕 Nova dúvida recebida (${getSubjectLabel(payload.subject)})`);
        } else if (payload?.type === "question_answered_ai") {
          pushToast(`🤖 A IA respondeu uma dúvida (${getSubjectLabel(payload.subject)})`);
        } else if (payload?.type === "question_answered_admin") {
          pushToast(`✅ Uma dúvida foi respondida (${getSubjectLabel(payload.subject)})`);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLiveStatus("offline");
        }
      });

    return () => {
      client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = questions.find((q) => q.id === selectedId) || null;
    const replyCount = current?.replies.length ?? 0;

    // Só rola para o fim quando: trocou de conversa, ou chegou mensagem nova
    // de verdade (mais respostas do que da última vez). Sem isso, o chat
    // "puxava" a rolagem para baixo a cada 6s (polling), mesmo com o admin
    // lendo mensagens antigas no meio da conversa.
    const conversationChanged = prevSelectedIdRef.current !== selectedId;
    const hasNewReply = !conversationChanged && replyCount > prevReplyCountRef.current;

    if (selectedId && (conversationChanged || hasNewReply)) {
      conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    prevSelectedIdRef.current = selectedId;
    prevReplyCountRef.current = replyCount;
  }, [selectedId, questions]);

  const selectedQuestion = questions.find((q) => q.id === selectedId) || null;

  const filteredQuestions = questions.filter((q) => {
    if (filter !== "all" && q.status !== filter) return false;
    if (subjectFilter !== "all" && q.subject !== subjectFilter) return false;
    return true;
  });

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  async function handleSendReply() {
    if (!selectedQuestion || !replyText.trim()) return;
    setSending(true);
    setSendError("");

    try {
      const res = await fetch(`/api/questions/${selectedQuestion.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao enviar resposta.");
      }

      if (data.whatsapp && !data.whatsapp.success) {
        setSendError(
          `Resposta salva, mas o envio ao WhatsApp falhou: ${data.whatsapp.error}`
        );
      }

      setReplyText("");
      fetchQuestions(false);
    } catch (err: any) {
      setSendError(err.message || "Erro inesperado.");
    } finally {
      setSending(false);
    }
  }

  async function openUserModal() {
    setShowUserModal(true);
    setUserError("");
    setUserSuccess("");
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) setAdmins(data.users);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreatingUser(true);
    setUserError("");
    setUserSuccess("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao criar usuário.");
      }

      setAdmins((prev) => [...prev, data.user]);
      setNewUsername("");
      setNewPassword("");
      setUserSuccess("Administrador criado com sucesso!");
    } catch (err: any) {
      setUserError(err.message || "Erro inesperado.");
    } finally {
      setCreatingUser(false);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-max-black">
      {/* Toasts de eventos em tempo real */}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="card-panel px-4 py-2.5 text-sm text-gray-100 shadow-jade-glow max-w-xs"
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-jade-900/40 bg-max-black-soft/60 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="font-extrabold text-lg">
            <span className="text-white">MAX</span>{" "}
            <span className="text-jade-400">Serviços</span>
          </h1>
          <span className="hidden sm:inline text-gray-500 text-sm">
            · Painel de dúvidas
          </span>
          <span
            className={`hidden md:inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ${
              liveStatus === "live"
                ? "border-jade-700/50 text-jade-300 bg-jade-500/10"
                : "border-gray-700/50 text-gray-500 bg-gray-800/20"
            }`}
            title={
              liveStatus === "live"
                ? "Atualizações em tempo real ativas"
                : "Sem tempo real — atualizando a cada 20s"
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                liveStatus === "live" ? "bg-jade-400 animate-pulse-soft" : "bg-gray-600"
              }`}
            />
            {liveStatus === "live" ? "Ao vivo" : "Modo intermitente"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/admin/metrics"
            className="text-sm px-3 py-1.5 rounded-lg border border-jade-700/50 text-jade-300 hover:bg-jade-900/30 transition-colors duration-300"
          >
            📊 Métricas
          </a>
          {currentUser.isMaster && (
            <button
              onClick={openUserModal}
              className="text-sm px-3 py-1.5 rounded-lg border border-jade-700/50 text-jade-300 hover:bg-jade-900/30 transition-colors duration-300"
            >
              + Administrador
            </button>
          )}
          <span className="hidden sm:inline text-sm text-gray-400">
            {currentUser.username}
            {currentUser.isMaster && (
              <span className="ml-1.5 text-[10px] uppercase tracking-wide bg-jade-500/20 text-jade-300 px-1.5 py-0.5 rounded">
                master
              </span>
            )}
          </span>
          <button
            onClick={handleLogout}
            className="text-sm px-3 py-1.5 rounded-lg bg-red-950/40 text-red-300 border border-red-900/50 hover:bg-red-900/40 transition-colors duration-300"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Faixa de boas-vindas */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden px-4 sm:px-6 py-4 border-b border-jade-900/30 bg-jade-radial shrink-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-jade-500/15 border border-jade-700/40 flex items-center justify-center text-jade-300 font-bold text-lg shrink-0">
              {toDisplayName(currentUser.username).charAt(0)}
            </div>
            <div>
              <p className="text-lg sm:text-xl font-bold text-white">
                {greeting}, {toDisplayName(currentUser.username)}
                <span className="ml-1">👋</span>
              </p>
              <p className="text-xs text-gray-500">
                {loading
                  ? "Carregando o painel..."
                  : `${questions.length} dúvida${questions.length === 1 ? "" : "s"} no total`}
              </p>
            </div>
          </div>

          {!loading && (
            <div className="flex gap-2">
              <div className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-700/30 text-amber-300 text-xs font-medium">
                {questions.filter((q) => q.status === "pending").length} pendentes
              </div>
              <div className="px-3 py-1.5 rounded-full bg-jade-500/10 border border-jade-700/30 text-jade-300 text-xs font-medium">
                {questions.filter((q) => q.status === "answered" && q.resolvedBy === "admin").length}{" "}
                respondidas
              </div>
              <div className="px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-700/30 text-sky-300 text-xs font-medium">
                🤖 {questions.filter((q) => q.resolvedBy === "ai").length} pela IA
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Corpo: conversa à esquerda, lista à direita */}
      <div className="flex-1 flex overflow-hidden">
        {/* Área de conversa (esquerda) */}
        <section
          className={`flex-1 flex flex-col min-w-0 ${
            mobileShowConversation ? "flex" : "hidden md:flex"
          }`}
        >
          {selectedQuestion ? (
            <>
              <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-jade-900/30 bg-max-black-soft/40 shrink-0">
                <button
                  onClick={() => setMobileShowConversation(false)}
                  className="md:hidden text-jade-300"
                  aria-label="Voltar"
                >
                  ←
                </button>
                <div className="w-9 h-9 rounded-full bg-jade-500/20 flex items-center justify-center text-jade-300 font-bold shrink-0">
                  {selectedQuestion.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">
                    {selectedQuestion.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {selectedQuestion.phone}
                  </p>
                </div>
                <span className="ml-auto hidden sm:inline text-[11px] px-2.5 py-1 rounded-full bg-jade-500/15 text-jade-300 border border-jade-700/40 shrink-0">
                  {getSubjectLabel(selectedQuestion.subject)}
                </span>
              </div>

              {isSessionExpired(selectedQuestion.lastInboundAt) && (
                <div className="px-4 sm:px-6 py-2 bg-amber-950/40 border-b border-amber-800/40 text-amber-300 text-xs">
                  ⚠ A janela de 24h do WhatsApp para essa conversa expirou. Uma
                  resposta em texto livre pode não ser entregue — configure um
                  template aprovado (TWILIO_CONTENT_SID) para reabrir a conversa.
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
                {/* Mensagem original do funcionário */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="max-w-[80%] sm:max-w-[65%] bg-max-black-card border border-jade-900/40 rounded-2xl rounded-tl-sm px-4 py-3">
                    <p className="text-gray-100 whitespace-pre-wrap break-words">
                      {selectedQuestion.message}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1.5">
                      {formatClock(selectedQuestion.createdAt)}
                    </p>
                  </div>
                </motion.div>

                {/* Respostas dos administradores (ou da IA) */}
                {selectedQuestion.replies.map((reply) => (
                  <motion.div
                    key={reply.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end"
                  >
                    <div
                      className={`max-w-[80%] sm:max-w-[65%] rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg ${
                        reply.isAiGenerated
                          ? "bg-gradient-to-br from-sky-700 to-sky-800"
                          : "bg-gradient-to-br from-jade-600 to-jade-700"
                      }`}
                    >
                      {reply.isAiGenerated && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-sky-950/50 text-sky-200 px-1.5 py-0.5 rounded mb-1.5">
                          🤖 Assistente IA
                          {reply.matchedScore != null && (
                            <span className="opacity-70">
                              · {Math.round(reply.matchedScore * 100)}% de similaridade
                            </span>
                          )}
                        </span>
                      )}
                      <p className="text-white whitespace-pre-wrap break-words">
                        {reply.text}
                      </p>
                      <div className="flex items-center justify-end gap-1.5 mt-1.5">
                        <span
                          className={`text-[11px] ${
                            reply.isAiGenerated ? "text-sky-100/80" : "text-jade-100/80"
                          }`}
                        >
                          {reply.isAiGenerated ? "Respondido automaticamente" : reply.adminUser.username} ·{" "}
                          {formatClock(reply.createdAt)}
                        </span>
                        {reply.sentToWhatsApp ? (
                          <span title="Enviado ao WhatsApp" className="text-jade-100">
                            ✓✓
                          </span>
                        ) : (
                          <span
                            title={reply.whatsappError || "Falha no envio"}
                            className="text-red-200"
                          >
                            ⚠
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
                <div ref={conversationEndRef} />
              </div>

              <div className="px-4 sm:px-6 py-4 border-t border-jade-900/30 bg-max-black-soft/40 shrink-0">
                {sendError && (
                  <p className="text-red-400 text-xs mb-2 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                    {sendError}
                  </p>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    placeholder="Escreva sua resposta... (Enter para enviar, Shift+Enter para quebrar linha)"
                    className="field-input resize-none min-h-[48px] max-h-[160px] flex-1"
                    rows={1}
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !replyText.trim()}
                    className="btn-primary shrink-0 !px-5"
                  >
                    {sending ? <LoadingSpinner size={18} /> : "Enviar"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="w-16 h-16 rounded-full bg-jade-500/10 flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
                    stroke="#34d399"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
              <p className="text-gray-400">
                Selecione uma dúvida na lista para ver a conversa
              </p>
            </div>
          )}
        </section>

        {/* Lista de dúvidas (direita) */}
        <aside
          className={`w-full md:w-96 border-l border-jade-900/30 bg-max-black-soft/30 flex-col shrink-0 ${
            mobileShowConversation ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="p-3 border-b border-jade-900/30 flex gap-2 shrink-0">
            {(["all", "pending", "answered"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors duration-300 ${
                  filter === f
                    ? "bg-jade-500/20 text-jade-300 border border-jade-600/50"
                    : "text-gray-500 border border-transparent hover:text-gray-300"
                }`}
              >
                {f === "all" ? "Todas" : f === "pending" ? "Pendentes" : "Respondidas"}
              </button>
            ))}
          </div>

          <div className="px-3 pb-3 border-b border-jade-900/30 shrink-0">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full text-xs bg-max-black-soft/60 border border-jade-800/50 rounded-lg px-3 py-2 text-gray-300 outline-none focus:border-jade-400 transition-colors duration-300"
            >
              <option value="all">Todos os assuntos</option>
              {SUBJECTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <SkeletonLine className="w-1/2" />
                    <SkeletonLine className="w-full" />
                  </div>
                ))}
              </div>
            ) : filteredQuestions.length === 0 ? (
              <p className="text-center text-gray-600 text-sm mt-10 px-4">
                Nenhuma dúvida por aqui ainda.
              </p>
            ) : (
              <AnimatePresence initial={false}>
                {filteredQuestions.map((q, idx) => (
                  <motion.button
                    key={q.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: idx * 0.03 } }}
                    onClick={() => {
                      setSelectedId(q.id);
                      setMobileShowConversation(true);
                      setSendError("");
                    }}
                    className={`w-full text-left px-4 py-3 border-b border-jade-900/20 flex gap-3 items-start transition-colors duration-300 ${
                      selectedId === q.id
                        ? "bg-jade-500/10"
                        : "hover:bg-jade-900/10"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-jade-500/15 flex items-center justify-center text-jade-300 font-bold shrink-0">
                      {q.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-100 truncate">{q.name}</p>
                        <span className="text-[11px] text-gray-600 shrink-0">
                          {timeAgo(q.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{q.message}</p>
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-jade-900/40 text-jade-400">
                        {getSubjectLabel(q.subject)}
                      </span>
                      {q.resolvedBy === "ai" && (
                        <span className="inline-block mt-1 ml-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-900/40 text-sky-300">
                          🤖 IA
                        </span>
                      )}
                    </div>
                    {q.status === "pending" ? (
                      <span className="w-2 h-2 rounded-full bg-jade-400 mt-2 shrink-0 animate-pulse-soft" />
                    ) : null}
                  </motion.button>
                ))}
              </AnimatePresence>
            )}
          </div>
        </aside>
      </div>

      {/* Modal de criação de administrador (somente master) */}
      <AnimatePresence>
        {showUserModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={() => setShowUserModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="card-panel w-full max-w-md p-6"
            >
              <h2 className="text-lg font-bold text-white mb-4">
                Novo administrador
              </h2>

              <form onSubmit={handleCreateUser} className="space-y-3 mb-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Usuário
                  </label>
                  <input
                    className="field-input"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Senha
                  </label>
                  <input
                    type="password"
                    className="field-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>

                {userError && (
                  <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                    {userError}
                  </p>
                )}
                {userSuccess && (
                  <p className="text-jade-300 text-sm bg-jade-950/30 border border-jade-800/40 rounded-lg px-3 py-2">
                    {userSuccess}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={creatingUser}
                  className="btn-primary w-full"
                >
                  {creatingUser ? <LoadingSpinner size={18} /> : "Criar administrador"}
                </button>
              </form>

              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                  Administradores atuais
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {admins.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between text-sm text-gray-300 px-3 py-1.5 rounded-lg bg-max-black-soft/50"
                    >
                      <span>{a.username}</span>
                      {a.isMaster && (
                        <span className="text-[10px] uppercase tracking-wide bg-jade-500/20 text-jade-300 px-1.5 py-0.5 rounded">
                          master
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowUserModal(false)}
                className="mt-5 w-full text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                Fechar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
