"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { LoadingSpinner, SkeletonLine } from "@/app/components/LoadingSpinner";

type Period = "day" | "week" | "month";

interface Totals {
  recebidas: number;
  respondidasHumano: number;
  respondidasIa: number;
  pendentes: number;
  taxaResposta: number;
  tempoMedioRespostaMinutos: number | null;
  mensagensAutomatizadasEstimadas: number;
}

interface SeriesPoint {
  label: string;
  recebidas: number;
  pendentes: number;
  respondidasHumano: number;
  respondidasIa: number;
}

interface MetricsResponse {
  period: Period;
  totals: Totals;
  series: SeriesPoint[];
}

interface AiSubjectSetting {
  key: string;
  label: string;
  enabled: boolean;
}

interface AiSettingsResponse {
  masterEnabled: boolean;
  similarityThreshold: number;
  minExamples: number;
  subjects: AiSubjectSetting[];
}

const PERIOD_LABELS: Record<Period, string> = {
  day: "Dia anterior",
  week: "Semanal",
  month: "Mensal",
};

function formatMinutes(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const hours = Math.floor(min / 60);
  const rest = Math.round(min % 60);
  return `${hours}h ${rest}min`;
}

function KpiCard({
  label,
  value,
  hint,
  accent = "jade",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "jade" | "sky" | "amber";
}) {
  const accentClass =
    accent === "sky" ? "text-sky-300" : accent === "amber" ? "text-amber-300" : "text-jade-300";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="card-panel p-4 sm:p-5"
    >
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl sm:text-3xl font-extrabold ${accentClass}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
    </motion.div>
  );
}

export function MetricsClient({
  currentUser,
}: {
  currentUser: { username: string; isMaster: boolean };
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [aiSettings, setAiSettings] = useState<AiSettingsResponse | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchMetrics = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/metrics?period=${p}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAiSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-settings", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setAiSettings(json);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchMetrics(period);
  }, [period, fetchMetrics]);

  useEffect(() => {
    fetchAiSettings();
  }, [fetchAiSettings]);

  async function updateAiSetting(payload: object, key: string) {
    setSavingKey(key);
    try {
      const res = await fetch("/api/admin/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) setAiSettings(json);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingKey(null);
    }
  }

  const totals = data?.totals;

  return (
    <div className="min-h-screen bg-max-black">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-jade-900/40 bg-max-black-soft/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <a href="/admin/dashboard" className="text-jade-300 mr-1" aria-label="Voltar">
            ←
          </a>
          <h1 className="font-extrabold text-lg">
            <span className="text-white">MAX</span> <span className="text-jade-400">Serviços</span>
          </h1>
          <span className="hidden sm:inline text-gray-500 text-sm">· Métricas</span>
        </div>
        <span className="text-sm text-gray-400">{currentUser.username}</span>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Toggle de período */}
        <div className="flex gap-2">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-sm px-4 py-2 rounded-full transition-all duration-300 ${
                period === p
                  ? "bg-jade-500/20 text-jade-300 border border-jade-600/60 shadow-jade-glow"
                  : "text-gray-500 border border-jade-900/40 hover:text-gray-300 hover:border-jade-800/60"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* KPIs */}
        {loading || !totals ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card-panel p-4 space-y-2">
                <SkeletonLine className="w-2/3" />
                <SkeletonLine className="w-1/3 h-6" />
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={period}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
            >
              <KpiCard label="Dúvidas recebidas" value={String(totals.recebidas)} />
              <KpiCard
                label="Respondidas (humano)"
                value={String(totals.respondidasHumano)}
                accent="jade"
              />
              <KpiCard
                label="Respondidas (IA)"
                value={String(totals.respondidasIa)}
                accent="sky"
              />
              <KpiCard label="Pendentes" value={String(totals.pendentes)} accent="amber" />
              <KpiCard label="Taxa de resposta" value={`${totals.taxaResposta}%`} />
              <KpiCard
                label="Tempo médio de resposta"
                value={formatMinutes(totals.tempoMedioRespostaMinutos)}
              />
            </motion.div>
          </AnimatePresence>
        )}

        {/* Gráfico */}
        <div className="card-panel p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Volume de dúvidas — {PERIOD_LABELS[period]}</h2>
            {loading && <LoadingSpinner size={16} />}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={period}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="h-72 sm:h-80"
            >
              {data && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradHumano" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00a86b" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#00a86b" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="gradIa" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="gradPendente" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0f1512" />
                    <XAxis
                      dataKey="label"
                      stroke="#4b5563"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "#1f2a24" }}
                      interval={period === "month" ? 3 : 0}
                    />
                    <YAxis stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "#0f1512",
                        border: "1px solid #075139",
                        borderRadius: 12,
                        fontSize: 12,
                        color: "#e5e7eb",
                      }}
                      labelStyle={{ color: "#34d399", fontWeight: 600 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="pendentes"
                      stackId="1"
                      stroke="#f59e0b"
                      fill="url(#gradPendente)"
                      name="Pendentes"
                      isAnimationActive
                      animationDuration={650}
                      animationEasing="ease-out"
                    />
                    <Area
                      type="monotone"
                      dataKey="respondidasHumano"
                      stackId="1"
                      stroke="#00a86b"
                      fill="url(#gradHumano)"
                      name="Respondidas (humano)"
                      isAnimationActive
                      animationDuration={650}
                      animationEasing="ease-out"
                    />
                    <Area
                      type="monotone"
                      dataKey="respondidasIa"
                      stackId="1"
                      stroke="#38bdf8"
                      fill="url(#gradIa)"
                      name="Respondidas (IA)"
                      isAnimationActive
                      animationDuration={650}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Pendentes
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-jade-500" /> Respondidas por humano
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> Respondidas por IA
            </span>
          </div>
        </div>

        {/* Desempenho / automação */}
        {totals && (
          <div className="card-panel p-5 sm:p-6">
            <h2 className="font-semibold text-white mb-1">Desempenho da automação</h2>
            <p className="text-sm text-gray-500 mb-4">
              O quanto o bot e a IA ajudaram a aliviar o atendimento manual no período selecionado.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-bold text-sky-300">{totals.respondidasIa}</p>
                <p className="text-xs text-gray-500">dúvidas resolvidas sem nenhum admin precisar responder</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-jade-300">
                  {totals.mensagensAutomatizadasEstimadas}
                </p>
                <p className="text-xs text-gray-500">
                  mensagens trocadas automaticamente pelo bot (estimativa: ~4 por dúvida — saudação/menu,
                  pedido de detalhes e confirmação)
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{totals.taxaResposta}%</p>
                <p className="text-xs text-gray-500">das dúvidas recebidas já têm resposta</p>
              </div>
            </div>
          </div>
        )}

        {/* Configurações da IA (só master) */}
        {currentUser.isMaster && aiSettings && (
          <div className="card-panel p-5 sm:p-6">
            <h2 className="font-semibold text-white mb-1">Configurações da IA de respostas automáticas</h2>
            <p className="text-sm text-gray-500 mb-4">
              Controla quando a IA pode responder sozinha (comparando com respostas humanas anteriores).
            </p>

            <div className="flex items-center justify-between py-3 border-b border-jade-900/30">
              <div>
                <p className="text-sm text-gray-200 font-medium">Interruptor geral da IA</p>
                <p className="text-xs text-gray-500">Desliga a resposta automática em todos os assuntos</p>
              </div>
              <button
                onClick={() =>
                  updateAiSetting({ masterEnabled: !aiSettings.masterEnabled }, "master")
                }
                disabled={savingKey === "master"}
                className={`w-12 h-7 rounded-full transition-colors duration-300 relative ${
                  aiSettings.masterEnabled ? "bg-jade-500" : "bg-gray-700"
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform duration-300 ${
                    aiSettings.masterEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-4 mb-2">Liberado por assunto:</p>
            <div className="space-y-2">
              {aiSettings.subjects.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-max-black-soft/40"
                >
                  <span className="text-sm text-gray-300">{s.label}</span>
                  <button
                    onClick={() => updateAiSetting({ subject: { key: s.key, enabled: !s.enabled } }, s.key)}
                    disabled={savingKey === s.key}
                    className={`w-10 h-6 rounded-full transition-colors duration-300 relative ${
                      s.enabled ? "bg-jade-500" : "bg-gray-700"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-300 ${
                        s.enabled ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-600 mt-4">
              Limiar de confiança atual: {Math.round(aiSettings.similarityThreshold * 100)}% de
              similaridade · mínimo de {aiSettings.minExamples} respostas humanas por assunto antes da
              IA começar a responder.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
