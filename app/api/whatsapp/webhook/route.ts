import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { sendFreeformWhatsApp, sendSubjectMenu, normalizeBrazilPhone } from "@/lib/whatsapp";
import { matchSubjectFromReply, getSubjectLabel } from "@/lib/subjects";
import { getGreetingBahia } from "@/lib/greeting";
import { tryAutoAnswer, getOrCreateAiUserId } from "@/lib/ai-matcher";
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
 *   AWAITING_MESSAGE  -> aguardando a descrição da dúvida
 *   AWAITING_ADMIN    -> dúvida registrada, aguardando resposta humana
 *   AWAITING_FEEDBACK -> a IA acabou de responder; se o colaborador escrever
 *                        de novo, entendemos que não resolveu e encaminhamos
 *                        para um humano
 *   IDLE              -> ciclo anterior concluído, pronto para nova dúvida
 */

const XML_EMPTY_RESPONSE = new NextResponse("<Response></Response>", {
  status: 200,
  headers: { "Content-Type": "text/xml" },
});

function shouldValidateSignature() {
  return process.env.TWILIO_VALIDATE_SIGNATURE !== "false";
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
  // Quando o colaborador toca em um item da lista interativa, a Twilio manda
  // o "id" que definimos (a subject.key) em ButtonPayload — bem mais
  // confiável do que tentar interpretar o texto do botão.
  const buttonPayload = params.ButtonPayload || null;

  if (!from) {
    return XML_EMPTY_RESPONSE;
  }

  // Proteção contra reenvio: se a Twilio já mandou esse mesmo MessageSid
  // antes, ignora silenciosamente (não processa de novo).
  if (messageSid) {
    try {
      await prisma.processedMessage.create({ data: { sid: messageSid } });
    } catch {
      // Já existe -> mensagem duplicada, não processa de novo.
      return XML_EMPTY_RESPONSE;
    }
  }

  const phone = normalizeBrazilPhone(from.replace("whatsapp:", ""));

  try {
    await handleIncomingMessage(phone, body, buttonPayload);
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

async function handleIncomingMessage(
  phone: string,
  body: string,
  buttonPayload: string | null
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
        `Entendido! Pode descrever sua dúvida sobre *${subject.label}* com o máximo de detalhes possível?`
      );
      return;
    }

    case "AWAITING_MESSAGE": {
      if (body.length < 5) {
        await reply(phone, "Pode descrever com um pouco mais de detalhe, por favor?");
        return;
      }

      const name = conversation.name || "Colaborador(a)";
      const subjectKey = conversation.pendingSubject || "outros_assuntos";

      const question = await prisma.question.create({
        data: { name, phone, subject: subjectKey, message: body },
      });

      await broadcastDashboardEvent({ type: "question_created", subject: subjectKey });

      // Tenta responder automaticamente com base em dúvidas parecidas já
      // respondidas por humanos (veja lib/ai-matcher.ts).
      const autoAnswer = await tryAutoAnswer({ subjectKey, message: body });

      if (autoAnswer.answered && autoAnswer.text) {
        const aiUserId = await getOrCreateAiUserId();
        const fullText = `${autoAnswer.text}\n\n_(resposta automática baseada em dúvidas parecidas já respondidas — se isso não resolveu, é só escrever de novo que um atendente humano assume)_`;

        // Tenta enviar ANTES de gravar o resultado — nunca registrar
        // "enviado" sem ter certeza de que foi enviado de verdade.
        const sendResult = await sendFreeformWhatsApp({ toPhone: phone, body: fullText });

        await prisma.reply.create({
          data: {
            questionId: question.id,
            text: autoAnswer.text,
            adminUserId: aiUserId,
            isAiGenerated: true,
            matchedScore: autoAnswer.score,
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
            data: { stage: "AWAITING_FEEDBACK", activeQuestionId: question.id },
          });

          await broadcastDashboardEvent({ type: "question_answered_ai", subject: subjectKey });
          return;
        }

        // Envio da IA falhou: a dúvida segue pendente e cai no fluxo normal
        // de encaminhamento para um humano, logo abaixo.
        console.error(
          `[whatsapp/webhook] Falha ao enviar resposta automática da IA para ${phone}:`,
          sendResult.error
        );
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

    case "AWAITING_FEEDBACK": {
      // Colaborador escreveu de novo depois de uma resposta automática da
      // IA — entendemos que não resolveu e encaminhamos para um humano.
      if (conversation.activeQuestionId) {
        await prisma.question.update({
          where: { id: conversation.activeQuestionId },
          data: { status: "pending", resolvedBy: null, lastInboundAt: new Date() },
        });
      }
      await prisma.conversation.update({
        where: { phone },
        data: { stage: "AWAITING_ADMIN" },
      });
      await reply(
        phone,
        "Entendido, vou encaminhar sua dúvida para um atendente humano cuidar pessoalmente. Obrigado pela paciência! 🙏"
      );
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
      if (conversation.name) {
        await prisma.conversation.update({
          where: { phone },
          data: { stage: "AWAITING_SUBJECT", pendingSubject: null, activeQuestionId: null },
        });
        await sendMenu(phone, `${getGreetingBahia()} de novo, ${conversation.name}!`);
      } else {
        await prisma.conversation.update({ where: { phone }, data: { stage: "AWAITING_NAME" } });
        await reply(
          phone,
          `${getGreetingBahia()}! Aqui é a *MAX Serviços* 👋\n\nPara começar, me diga seu *nome completo*, por favor.`
        );
      }
      return;
    }
  }
}
