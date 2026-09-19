import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { sendFreeformWhatsApp, normalizeBrazilPhone } from "@/lib/whatsapp";
import { buildSubjectMenuText, matchSubjectFromReply, getSubjectLabel } from "@/lib/subjects";
import { getGreetingBahia } from "@/lib/greeting";

/**
 * ENDPOINT: POST /api/whatsapp/webhook
 * ---------------------------------------------------------------------------
 * Configure esse endereço completo (https://SEU-DOMINIO/api/whatsapp/webhook)
 * no painel da Twilio, no WhatsApp Sender do número +55 71 8266-8840, no
 * campo "When a message comes in" (método POST). A partir daí, toda
 * mensagem que um colaborador mandar para esse número chega aqui.
 *
 * Fluxo conduzido (máquina de estados guardada em `Conversation.stage`):
 *   AWAITING_NAME     -> aguardando o nome completo do colaborador
 *   AWAITING_SUBJECT  -> aguardando a escolha do assunto no menu
 *   AWAITING_MESSAGE  -> aguardando a descrição da dúvida
 *   AWAITING_ADMIN    -> dúvida já registrada, aguardando resposta humana
 *   IDLE              -> ciclo anterior concluído, pronto para uma nova dúvida
 */

const XML_EMPTY_RESPONSE = new NextResponse("<Response></Response>", {
  status: 200,
  headers: { "Content-Type": "text/xml" },
});

function shouldValidateSignature() {
  // Em produção, validamos a assinatura da Twilio por padrão (segurança).
  // Para testar localmente sem HTTPS/domínio público, defina
  // TWILIO_VALIDATE_SIGNATURE=false no seu .env local.
  return process.env.TWILIO_VALIDATE_SIGNATURE !== "false";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  if (shouldValidateSignature()) {
    const signature = req.headers.get("x-twilio-signature") || "";
    const authToken = process.env.TWILIO_AUTH_TOKEN || "";
    const url = req.url;

    const valid = twilio.validateRequest(authToken, signature, url, params);
    if (!valid) {
      console.error("[whatsapp/webhook] Assinatura da Twilio inválida.");
      return new NextResponse("Assinatura inválida", { status: 403 });
    }
  }

  const from = params.From || ""; // formato: "whatsapp:+5571999999999"
  const body = (params.Body || "").trim();
  const phone = normalizeBrazilPhone(from.replace("whatsapp:", ""));

  if (!from) {
    return XML_EMPTY_RESPONSE;
  }

  try {
    await handleIncomingMessage(phone, body);
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

async function handleIncomingMessage(phone: string, body: string) {
  const conversation = await prisma.conversation.findUnique({ where: { phone } });

  // Primeiro contato desse número: cria a conversa e manda a saudação,
  // sem tratar essa primeira mensagem como resposta a nada.
  if (!conversation) {
    await prisma.conversation.create({
      data: { phone, stage: "AWAITING_NAME" },
    });
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
      await reply(phone, `Prazer, ${body}! ${buildSubjectMenuText()}`);
      return;
    }

    case "AWAITING_SUBJECT": {
      const subject = matchSubjectFromReply(body);
      if (!subject) {
        await reply(
          phone,
          `Não entendi essa opção. ${buildSubjectMenuText()}`
        );
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

      await prisma.conversation.update({
        where: { phone },
        data: {
          stage: "AWAITING_ADMIN",
          pendingSubject: null,
          activeQuestionId: question.id,
        },
      });

      await reply(
        phone,
        `Recebemos sua dúvida sobre *${getSubjectLabel(
          subjectKey
        )}*! ✅\n\nNossa equipe vai analisar e te responder por aqui mesmo, pelo WhatsApp. Obrigado, ${name}!`
      );
      return;
    }

    case "AWAITING_ADMIN": {
      // Colaborador escreveu de novo enquanto a dúvida ainda não foi
      // respondida. Avisamos que já está sendo cuidada e "renovamos" a
      // janela de 24h dessa dúvida.
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
      // Ciclo anterior já concluído (dúvida respondida). Começamos um novo
      // ciclo, mas já pulamos a etapa de nome, pois já o conhecemos.
      if (conversation.name) {
        await prisma.conversation.update({
          where: { phone },
          data: { stage: "AWAITING_SUBJECT", pendingSubject: null, activeQuestionId: null },
        });
        await reply(
          phone,
          `${getGreetingBahia()} de novo, ${conversation.name}! ${buildSubjectMenuText()}`
        );
      } else {
        await prisma.conversation.update({
          where: { phone },
          data: { stage: "AWAITING_NAME" },
        });
        await reply(
          phone,
          `${getGreetingBahia()}! Aqui é a *MAX Serviços* 👋\n\nPara começar, me diga seu *nome completo*, por favor.`
        );
      }
      return;
    }
  }
}
