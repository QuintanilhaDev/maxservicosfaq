import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { sendFreeformWhatsApp, sendSubjectMenu, normalizeBrazilPhone } from "@/lib/whatsapp";
import { matchSubjectFromReply, getSubjectLabel } from "@/lib/subjects";
import { getGreetingBahia } from "@/lib/greeting";
import { tryAutoAnswer, getOrCreateAiUserId, markAiAnswerAsRejected } from "@/lib/ai-matcher";
import { broadcastDashboardEvent } from "@/lib/realtime";

/**
 * ENDPOINT: POST /api/whatsapp/webhook
 * ---------------------------------------------------------------------------
 * Configure esse endereço (https://SEU-DOMINIO/api/whatsapp/webhook) no
 * WhatsApp Sender da Twilio, em "When a message comes in" (método POST).
 *
 * Fluxo (máquina de estados em Conversation.stage):
 *   AWAITING_NAME     -> aguardando o nome completo do colaborador
 *   AWAITING_SUBJECT  -> aguardando a escolha do assunto (lista interativa)
 *   AWAITING_MESSAGE  -> aguardando a descrição da dúvida (aceita anexo)
 *   AWAITING_ADMIN    -> dúvida registrada, aguardando resposta humana
 *   AWAITING_RATING   -> aguardando "isso resolveu? 1-Sim / 2-Não", depois de
 *                        QUALQUER resposta (humana ou da IA). Se "não" numa
 *                        dúvida respondida pela IA, isso alimenta o
 *                        aprendizado por rejeição (markAiAnswerAsRejected).
 *   IDLE              -> ciclo anterior concluído, pronto para nova dúvida
 */

const XML_EMPTY_RESPONSE = new NextResponse("<Response></Response>", {
  status: 200,
  headers: { "Content-Type": "text/xml" },
});

function shouldValidateSignature() {
  return process.env.TWILIO_VALIDATE_SIGNATURE !== "false";
}

interface IncomingMedia {
  url: string;
  contentType: string;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  if (shouldValidateSignature()) {
    const signature = req.headers.get("x-twilio-signature") || "";
    const authToken = process.env.TWILIO_AUTH_TOKEN || "";
    const valid = twilio.validateRequest(authToken, signature, req.url, params);
    if (!valid) {
      console.error("[whatsapp/webhook] Assinatura da Twilio inválida.");
      return new NextResponse("Assinatura inválida", { status: 403 });
    }
  }

  const from = params.From || ""; // "whatsapp:+5571999999999"
  const body = (params.Body || "").trim();
  const messageSid = params.MessageSid || null;
  const buttonPayload = params.ButtonPayload || null;

  const numMedia = parseInt(params.NumMedia || "0", 10) || 0;
  const media: IncomingMedia[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`];
    const contentType = params[`MediaContentType${i}`] || "application/octet-stream";
    if (url) media.push({ url, contentType });
  }

  if (!from) {
    return XML_EMPTY_RESPONSE;
  }

  // Proteção contra reenvio: se a Twilio já mandou esse mesmo MessageSid
  // antes, ignora silenciosamente (não processa de novo).
  if (messageSid) {
    try {
      await prisma.processedMessage.create({ data: { sid: messageSid } });
    } catch {
      return XML_EMPTY_RESPONSE;
    }
  }

  const phone = normalizeBrazilPhone(from.replace("whatsapp:", ""));

  try {
    await handleIncomingMessage(phone, body, buttonPayload, media);
  } catch (err) {
    console.error("[whatsapp/webhook] Erro ao processar mensagem:", err);
  }

  return XML_EMPTY_RESPONSE;
}

async function reply(phone: string, text: string) {
  const result = await sendFreeformWhatsApp({ toPhone: phone, body: text });
  if (!result.success) {
    console.error(`[whatsapp/webhook] Falha ao enviar mensagem para ${phone}:`, result.error);
  }
}

async function sendMenu(phone: string, prefixText?: string) {
  const result = await sendSubjectMenu({ toPhone: phone, prefixText });
  if (!result.success) {
    console.error(`[whatsapp/webhook] Falha ao enviar menu para ${phone}:`, result.error);
  }
}

/** Inicia um novo ciclo de dúvida — pulando a etapa de nome se já soubermos. */
async function startNewCycle(phone: string, knownName: string | null) {
  if (knownName) {
    await prisma.conversation.update({
      where: { phone },
      data: { stage: "AWAITING_SUBJECT", pendingSubject: null, activeQuestionId: null },
    });
    await sendMenu(phone, `${getGreetingBahia()} de novo, ${knownName}!`);
  } else {
    await prisma.conversation.update({ where: { phone }, data: { stage: "AWAITING_NAME" } });
    await reply(
      phone,
      `${getGreetingBahia()}! Aqui é a *MAX Serviços* 👋\n\nPara começar, me diga seu *nome completo*, por favor.`
    );
  }
}

async function handleIncomingMessage(
  phone: string,
  body: string,
  buttonPayload: string | null,
  media: IncomingMedia[]
) {
  const conversation = await prisma.conversation.findUnique({ where: { phone } });

  // Primeiro contato desse número: cria a conversa e manda a saudação,
  // sem tratar essa primeira mensagem como resposta a nada.
  if (!conversation) {
    await prisma.conversation.create({ data: { phone, stage: "AWAITING_NAME" } });
    await reply(
      phone,
      `${getGreetingBahia()}! Aqui é a *MAX Serviços* 👋\n\nPara começar, me diga seu *nome completo*, por favor.`
    );
    return;
  }

  switch (conversation.stage) {
    case "AWAITING_NAME": {
      if (body.length < 3) {
        await reply(phone, "Não entendi. Pode me dizer seu *nome completo*?");
        return;
      }
      await prisma.conversation.update({
        where: { phone },
        data: { name: body, stage: "AWAITING_SUBJECT" },
      });
      await sendMenu(phone, `Prazer, ${body}!`);
      return;
    }

    case "AWAITING_SUBJECT": {
      const subject =
        (buttonPayload && matchSubjectFromReply(buttonPayload)) || matchSubjectFromReply(body);

      if (!subject) {
        await sendMenu(phone, "Não entendi essa opção.");
        return;
      }
      await prisma.conversation.update({
        where: { phone },
        data: { pendingSubject: subject.key, stage: "AWAITING_MESSAGE" },
      });
      await reply(
        phone,
        `Entendido! Pode descrever sua dúvida sobre *${subject.label}* com o máximo de detalhes possível? Se quiser, pode mandar uma foto ou documento junto.`
      );
      return;
    }

    case "AWAITING_MESSAGE": {
      // Aceita a mensagem se tiver texto suficiente OU pelo menos um anexo
      // (colaborador pode mandar só uma foto, sem legenda).
      if (body.length < 5 && media.length === 0) {
        await reply(phone, "Pode descrever com um pouco mais de detalhe, por favor?");
        return;
      }

      const name = conversation.name || "Colaborador(a)";
      const subjectKey = conversation.pendingSubject || "outros_assuntos";
      const messageText = body.length > 0 ? body : "(anexo enviado, sem descrição em texto)";

      const question = await prisma.question.create({
        data: { name, phone, subject: subjectKey, message: messageText },
      });

      if (media.length > 0) {
        await prisma.attachment.createMany({
          data: media.map((m) => ({
            questionId: question.id,
            url: m.url,
            contentType: m.contentType,
          })),
        });
      }

      await broadcastDashboardEvent({ type: "question_created", subject: subjectKey });

      // Tenta responder automaticamente com base em dúvidas parecidas já
      // respondidas por humanos (veja lib/ai-matcher.ts). Anexos não entram
      // na comparação — só o texto da dúvida.
      const autoAnswer = await tryAutoAnswer({ subjectKey, message: messageText });

      if (autoAnswer.answered && autoAnswer.text) {
        const aiUserId = await getOrCreateAiUserId();
        const fullText = `${autoAnswer.text}\n\n_(resposta automática baseada em dúvidas parecidas já respondidas)_\n\nIsso resolveu sua dúvida? Responda *1* para Sim ou *2* para Não.`;

        const sendResult = await sendFreeformWhatsApp({ toPhone: phone, body: fullText });

        await prisma.reply.create({
          data: {
            questionId: question.id,
            text: autoAnswer.text,
            adminUserId: aiUserId,
            isAiGenerated: true,
            matchedScore: autoAnswer.score,
            sourceReplyId: autoAnswer.matchedReplyId,
            sentToWhatsApp: sendResult.success,
            whatsappError: sendResult.success ? null : sendResult.error,
          },
        });

        if (sendResult.success) {
          await prisma.question.update({
            where: { id: question.id },
            data: { status: "answered", resolvedBy: "ai" },
          });

          await prisma.conversation.update({
            where: { phone },
            data: { stage: "AWAITING_RATING", activeQuestionId: question.id },
          });

          await broadcastDashboardEvent({ type: "question_answered_ai", subject: subjectKey });
          return;
        }

        console.error(
          `[whatsapp/webhook] Falha ao enviar resposta automática da IA para ${phone}:`,
          sendResult.error
        );
        // cai para o encaminhamento normal ao humano, abaixo
      }

      await prisma.conversation.update({
        where: { phone },
        data: { stage: "AWAITING_ADMIN", pendingSubject: null, activeQuestionId: question.id },
      });

      await reply(
        phone,
        `Recebemos sua dúvida sobre *${getSubjectLabel(
          subjectKey
        )}*! ✅\n\nNossa equipe vai analisar e te responder por aqui mesmo, pelo WhatsApp. Obrigado, ${name}!`
      );
      return;
    }

    case "AWAITING_RATING": {
      const text = body.trim().toLowerCase();
      const positive = ["1", "sim", "s", "👍", "resolveu", "ajudou"].some(
        (v) => text === v || text.includes(v)
      );
      const negative = ["2", "não", "nao", "n", "👎", "não resolveu"].some(
        (v) => text === v || text.includes(v)
      );

      const questionId = conversation.activeQuestionId;

      if (positive && questionId) {
        await prisma.question.update({ where: { id: questionId }, data: { satisfaction: "positive" } });
        await prisma.conversation.update({
          where: { phone },
          data: { stage: "IDLE", activeQuestionId: null },
        });
        await reply(phone, "Que bom! Fico feliz em ajudar. 😊");
        return;
      }

      if (negative && questionId) {
        const question = await prisma.question.findUnique({ where: { id: questionId } });

        // Se essa dúvida tinha sido respondida pela IA, isso é justamente o
        // sinal de rejeição que ensina a IA a não reutilizar aquela resposta.
        if (question?.resolvedBy === "ai") {
          await markAiAnswerAsRejected(questionId);
        }

        await prisma.question.update({
          where: { id: questionId },
          data: { satisfaction: "negative", status: "pending", resolvedBy: null },
        });
        await prisma.conversation.update({
          where: { phone },
          data: { stage: "AWAITING_ADMIN" },
        });
        await broadcastDashboardEvent({
          type: "question_reopened",
          subject: question?.subject || "outros_assuntos",
        });
        await reply(
          phone,
          "Entendido, vou encaminhar sua dúvida para um atendente humano cuidar pessoalmente. Obrigado pela paciência! 🙏"
        );
        return;
      }

      // Resposta não reconhecida como avaliação — provavelmente o
      // colaborador já está falando de outra coisa. Em vez de insistir
      // "responda 1 ou 2" (o que travaria a conversa), tratamos como o
      // início de um novo ciclo normalmente.
      await startNewCycle(phone, conversation.name);
      return;
    }

    case "AWAITING_ADMIN": {
      if (conversation.activeQuestionId) {
        await prisma.question
          .update({
            where: { id: conversation.activeQuestionId },
            data: { lastInboundAt: new Date() },
          })
          .catch(() => null);
      }
      await reply(
        phone,
        "Sua dúvida já está com a nossa equipe e será respondida por aqui em breve. Obrigado pela paciência! 🙏"
      );
      return;
    }

    case "IDLE":
    default: {
      await startNewCycle(phone, conversation.name);
      return;
    }
  }
}
