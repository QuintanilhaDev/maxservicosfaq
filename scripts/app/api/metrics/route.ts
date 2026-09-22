import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

type Period = "day" | "week" | "month";

// Mensagens automáticas que o bot manda por ciclo completo (saudação/menu,
// pedido de detalhes, confirmação) — usado só para dar uma noção de volume
// de atendimento automatizado. É uma ESTIMATIVA, deixamos isso explícito na
// interface, não é uma contagem exata mensagem a mensagem.
const ESTIMATED_BOT_MESSAGES_PER_QUESTION = 4;

function bahiaDateKey(date: Date): string {
  // formato YYYY-MM-DD no fuso horário da Bahia
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function bahiaHour(date: Date): number {
  const str = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Bahia",
    hour: "2-digit",
    hourCycle: "h23", // garante 00–23 (hour12:false pode virar "24" em vez de "00" em algumas versões de ICU)
  }).format(date);
  const hour = parseInt(str, 10);
  return Math.min(Math.max(hour, 0), 23); // blindagem extra, nunca sai de 0–23
}

function weekdayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12)); // meio-dia UTC evita virar o dia
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");
}

function shortDateLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${d}/${m}`;
}

function addDaysToKey(baseKey: string, offset: number): string {
  const [y, m, d] = baseKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + offset, 12));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

interface Bucket {
  key: string;
  label: string;
  recebidas: number;
  pendentes: number;
  respondidasHumano: number;
  respondidasIa: number;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const period = (searchParams.get("period") || "week") as Period;

  const now = new Date();
  const todayKey = bahiaDateKey(now);
  const fetchSinceDays = period === "day" ? 3 : period === "week" ? 9 : 32;
  const since = new Date(now.getTime() - fetchSinceDays * 24 * 60 * 60 * 1000);

  const questions = await prisma.question.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    include: {
      replies: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  // Monta os "baldes" (buckets) vazios primeiro, na ordem certa, para o
  // gráfico sempre mostrar o período inteiro mesmo sem dados em algum ponto.
  let buckets: Bucket[] = [];

  if (period === "day") {
    const yesterdayKey = addDaysToKey(todayKey, -1);
    buckets = Array.from({ length: 24 }, (_, hour) => ({
      key: `${yesterdayKey}-${hour}`,
      label: `${String(hour).padStart(2, "0")}h`,
      recebidas: 0,
      pendentes: 0,
      respondidasHumano: 0,
      respondidasIa: 0,
    }));
  } else if (period === "week") {
    buckets = Array.from({ length: 7 }, (_, i) => {
      const key = addDaysToKey(todayKey, -6 + i);
      return {
        key,
        label: weekdayLabel(key),
        recebidas: 0,
        pendentes: 0,
        respondidasHumano: 0,
        respondidasIa: 0,
      };
    });
  } else {
    buckets = Array.from({ length: 30 }, (_, i) => {
      const key = addDaysToKey(todayKey, -29 + i);
      return {
        key,
        label: shortDateLabel(key),
        recebidas: 0,
        pendentes: 0,
        respondidasHumano: 0,
        respondidasIa: 0,
      };
    });
  }

  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));

  let totalInPeriod = 0;
  let totalAnsweredAdmin = 0;
  let totalAnsweredAi = 0;
  let totalPending = 0;
  let responseTimesMinutes: number[] = [];

  const yesterdayKey = addDaysToKey(todayKey, -1);

  for (const q of questions) {
    const dateKey = bahiaDateKey(q.createdAt);
    let bucketKey: string | null = null;

    if (period === "day") {
      if (dateKey !== yesterdayKey) continue;
      bucketKey = `${dateKey}-${bahiaHour(q.createdAt)}`;
    } else if (period === "week") {
      if (dateKey < addDaysToKey(todayKey, -6)) continue;
      bucketKey = dateKey;
    } else {
      if (dateKey < addDaysToKey(todayKey, -29)) continue;
      bucketKey = dateKey;
    }

    const idx = bucketKey ? bucketIndex.get(bucketKey) : undefined;
    if (idx === undefined) continue;

    totalInPeriod++;
    buckets[idx].recebidas++;

    if (q.status === "answered" && q.resolvedBy === "ai") {
      totalAnsweredAi++;
      buckets[idx].respondidasIa++;
    } else if (q.status === "answered") {
      totalAnsweredAdmin++;
      buckets[idx].respondidasHumano++;
    } else {
      totalPending++;
      buckets[idx].pendentes++;
    }

    if (q.status === "answered" && q.replies[0]) {
      const minutes = (q.replies[0].createdAt.getTime() - q.createdAt.getTime()) / 60000;
      if (minutes >= 0) responseTimesMinutes.push(minutes);
    }
  }

  const totalAnswered = totalAnsweredAdmin + totalAnsweredAi;
  const responseRate = totalInPeriod > 0 ? (totalAnswered / totalInPeriod) * 100 : 0;
  const avgResponseMinutes =
    responseTimesMinutes.length > 0
      ? responseTimesMinutes.reduce((a, b) => a + b, 0) / responseTimesMinutes.length
      : null;

  return NextResponse.json({
    period,
    totals: {
      recebidas: totalInPeriod,
      respondidasHumano: totalAnsweredAdmin,
      respondidasIa: totalAnsweredAi,
      pendentes: totalPending,
      taxaResposta: Math.round(responseRate * 10) / 10,
      tempoMedioRespostaMinutos:
        avgResponseMinutes !== null ? Math.round(avgResponseMinutes * 10) / 10 : null,
      mensagensAutomatizadasEstimadas: totalInPeriod * ESTIMATED_BOT_MESSAGES_PER_QUESTION,
    },
    series: buckets.map((b) => ({
      label: b.label,
      recebidas: b.recebidas,
      pendentes: b.pendentes,
      respondidasHumano: b.respondidasHumano,
      respondidasIa: b.respondidasIa,
    })),
  });
}
