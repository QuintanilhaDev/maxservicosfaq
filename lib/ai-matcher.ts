import { prisma } from "./prisma";
import { findMostSimilar } from "./similarity";
import { hashPassword } from "./auth";
import {
  isMasterAiEnabled,
  isSubjectAiEnabled,
  getSimilarityThreshold,
  getMinExamples,
} from "./ai-settings";

export const AI_SYSTEM_USERNAME = "assistente-ia";

/**
 * O modelo Reply exige um adminUserId (autor humano). Para registrar as
 * respostas automáticas com transparência total no histórico, usamos um
 * usuário "sistema" fixo chamado assistente-ia — ele não consegue logar de
 * verdade (a senha é aleatória e descartada na hora), serve só para marcar
 * autoria nas respostas gravadas.
 */
export async function getOrCreateAiUserId(): Promise<string> {
  const existing = await prisma.adminUser.findUnique({
    where: { username: AI_SYSTEM_USERNAME },
  });
  if (existing) return existing.id;

  const randomPassword =
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const hashed = await hashPassword(randomPassword);

  const created = await prisma.adminUser.create({
    data: { username: AI_SYSTEM_USERNAME, password: hashed, isMaster: false },
  });
  return created.id;
}

/**
 * Chamado quando o colaborador avalia como "não ajudou" uma dúvida que foi
 * respondida pela IA. Encontra a resposta HUMANA original que a IA
 * reaproveitou e marca ela como "excludedFromAi" — a partir daí, a IA não
 * volta a sugerir esse mesmo texto para dúvidas parecidas. A resposta em si
 * continua no histórico normalmente, só para de ser usada como modelo.
 */
export async function markAiAnswerAsRejected(questionId: string): Promise<void> {
  const aiReply = await prisma.reply.findFirst({
    where: { questionId, isAiGenerated: true },
    orderBy: { createdAt: "desc" },
  });

  if (aiReply?.sourceReplyId) {
    await prisma.reply.update({
      where: { id: aiReply.sourceReplyId },
      data: { excludedFromAi: true },
    });
  }
}

const MAX_EXAMPLES_CONSIDERED = 300; // limite de segurança de performance

export interface AutoAnswerResult {
  answered: boolean;
  text?: string;
  matchedQuestionId?: string;
  matchedReplyId?: string;
  score?: number;
}

/**
 * Tenta responder automaticamente uma dúvida nova, comparando-a com dúvidas
 * anteriores do MESMO assunto que já foram respondidas por um humano.
 * Só responde se: (1) o interruptor mestre da IA estiver ligado, (2) o
 * assunto estiver liberado para resposta automática, (3) já existir uma
 * quantidade mínima de exemplos humanos para aquele assunto, e (4) a dúvida
 * mais parecida encontrada tiver similaridade acima do limite configurado.
 * Quando responde, reutiliza o texto EXATO de uma resposta humana já dada —
 * nunca gera um texto novo. Respostas marcadas como "excludedFromAi" (porque
 * já foram usadas antes e o colaborador avaliou que não ajudou) ficam de
 * fora da busca — é assim que a IA "aprende com a rejeição".
 */
export async function tryAutoAnswer(params: {
  subjectKey: string;
  message: string;
}): Promise<AutoAnswerResult> {
  const [masterEnabled, subjectEnabled, threshold, minExamples] = await Promise.all([
    isMasterAiEnabled(),
    isSubjectAiEnabled(params.subjectKey),
    getSimilarityThreshold(),
    getMinExamples(),
  ]);

  if (!masterEnabled || !subjectEnabled) {
    return { answered: false };
  }

  // Busca dúvidas anteriores do mesmo assunto que já têm uma resposta
  // HUMANA (isAiGenerated: false) ainda não rejeitada (excludedFromAi: false).
  const pastQuestions = await prisma.question.findMany({
    where: {
      subject: params.subjectKey,
      replies: { some: { isAiGenerated: false, excludedFromAi: false } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_EXAMPLES_CONSIDERED,
    include: {
      replies: {
        where: { isAiGenerated: false, excludedFromAi: false },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (pastQuestions.length < minExamples) {
    return { answered: false };
  }

  const corpus = pastQuestions
    .filter((q) => q.replies.length > 0)
    .map((q) => ({ id: q.id, text: q.message }));

  const match = findMostSimilar(params.message, corpus);
  if (!match || match.score < threshold) {
    return { answered: false };
  }

  const matchedQuestion = pastQuestions.find((q) => q.id === match.id);
  const matchedReply = matchedQuestion?.replies[0];
  if (!matchedQuestion || !matchedReply) {
    return { answered: false };
  }

  return {
    answered: true,
    text: matchedReply.text,
    matchedQuestionId: matchedQuestion.id,
    matchedReplyId: matchedReply.id,
    score: match.score,
  };
}
