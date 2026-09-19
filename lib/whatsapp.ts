import twilio from "twilio";

/**
 * INTEGRAÇÃO WHATSAPP (via Twilio)
 * ---------------------------------------------------------------------------
 * Este arquivo centraliza o envio das respostas do dashboard para o WhatsApp
 * do funcionário que fez a pergunta.
 *
 * IMPORTANTE — leia antes de usar em produção:
 *
 * 1) O número +55 71 8266-8840 precisa estar cadastrado como "WhatsApp Sender"
 *    aprovado dentro de uma conta Twilio (console.twilio.com > Messaging >
 *    Senders > WhatsApp senders). Isso passa por aprovação da Meta e não é
 *    algo que pode ser feito por código — é um processo administrativo.
 *
 * 2) Como o fluxo aqui é "a empresa inicia a conversa" (o funcionário nunca
 *    mandou mensagem para esse número pelo WhatsApp antes, ele só preencheu
 *    um formulário web), a política da Meta EXIGE o uso de um "Message
 *    Template" pré-aprovado para essa primeira mensagem — não é possível
 *    mandar texto livre para quem nunca abriu uma janela de conversa de 24h
 *    com o número. Configure um template (ex: "Olá {{1}}, sobre sua dúvida:
 *    {{2}}") no painel da Twilio/Meta e coloque o SID dele em
 *    TWILIO_CONTENT_SID no .env.
 *
 * 3) Se TWILIO_CONTENT_SID não estiver configurado, o sistema tenta enviar
 *    texto livre (funciona apenas se o funcionário já iniciou uma conversa
 *    com o número nas últimas 24h) e registra erro caso a Meta recuse.
 *
 * 4) Todo envio (sucesso ou falha) fica registrado no banco em Reply
 *    (sentToWhatsApp / whatsappError), então nada é perdido caso o envio
 *    falhe — o admin pode reenviar manualmente depois.
 */

interface SendResult {
  success: boolean;
  error?: string;
  sid?: string;
}

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

/**
 * Normaliza um telefone brasileiro para o formato E.164 (+55DDDNUMERO)
 * aceitando entradas como "71 99999-9999", "(71) 99999-9999", "5571999999999" etc.
 */
export function normalizeBrazilPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");

  // Remove zero inicial de DDD digitado por engano (ex: 071...)
  if (digits.startsWith("0")) digits = digits.slice(1);

  // Já tem código do país
  if (digits.startsWith("55") && digits.length >= 12) {
    return `+${digits}`;
  }

  // DDD + número (10 ou 11 dígitos)
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  // Fallback: devolve como veio, prefixado com +
  return digits.startsWith("+") ? raw : `+${digits}`;
}

export async function sendWhatsAppReply(params: {
  toPhone: string;
  employeeName: string;
  replyText: string;
}): Promise<SendResult> {
  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = process.env.TWILIO_CONTENT_SID;

  if (!client || !from) {
    return {
      success: false,
      error:
        "Twilio não configurado (defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM no .env).",
    };
  }

  const to = `whatsapp:${normalizeBrazilPhone(params.toPhone)}`;

  try {
    if (contentSid) {
      // Envio via Content Template aprovado (recomendado / obrigatório
      // para primeira mensagem business-initiated).
      const message = await client.messages.create({
        from,
        to,
        contentSid,
        contentVariables: JSON.stringify({
          1: params.employeeName,
          2: params.replyText,
        }),
      });
      return { success: true, sid: message.sid };
    }

    // Fallback: texto livre (só funciona dentro da janela de 24h iniciada
    // pelo próprio usuário no WhatsApp).
    const body = `Olá ${params.employeeName}! Aqui é a MAX Serviços respondendo sua dúvida:\n\n${params.replyText}`;
    const message = await client.messages.create({ from, to, body });
    return { success: true, sid: message.sid };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Erro desconhecido ao enviar mensagem via Twilio.",
    };
  }
}
