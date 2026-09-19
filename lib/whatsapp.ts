import twilio from "twilio";

/**
 * INTEGRAÇÃO WHATSAPP (via Twilio)
 * ---------------------------------------------------------------------------
 * Este arquivo centraliza todo envio de mensagens de WhatsApp: tanto as
 * mensagens automáticas do bot (saudação, menu, confirmação) quanto as
 * respostas manuais que o admin escreve no dashboard.
 *
 * REGRA DO WHATSAPP QUE PRECISA SER RESPEITADA:
 * Depois que um colaborador manda uma mensagem, a empresa tem uma "janela"
 * de 24 horas para responder com texto livre. Dentro dessa janela, tudo
 * funciona sem restrição (é o que o bot usa o tempo todo, já que está sempre
 * respondendo a uma mensagem recebida). Se o admin demorar mais de 24h para
 * responder pelo dashboard, o WhatsApp não entrega mais texto livre — é
 * necessário reabrir a conversa com um "Message Template" pré-aprovado pela
 * Meta (configurável em TWILIO_CONTENT_SID). Esse arquivo já verifica isso
 * automaticamente e avisa o admin quando a janela expirou.
 *
 * SETUP NECESSÁRIO NA TWILIO (feito pela empresa, fora do código):
 * 1) Registrar +55 71 8266-8840 como WhatsApp Sender aprovado
 *    (console.twilio.com > Messaging > Senders > WhatsApp senders).
 * 2) Configurar, nesse mesmo sender, "When a message comes in" apontando
 *    para: https://SEU-DOMINIO.vercel.app/api/whatsapp/webhook (método POST).
 * 3) (Opcional, mas recomendado) Criar um Content Template aprovado pela
 *    Meta para reabrir conversas depois de 24h, e colocar o SID gerado em
 *    TWILIO_CONTENT_SID no .env.
 */

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 horas

interface SendResult {
  success: boolean;
  error?: string;
  sid?: string;
  requiresTemplate?: boolean;
}

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

/**
 * Normaliza um telefone brasileiro para o formato E.164 (+55DDDNUMERO)
 * aceitando entradas como "71 99999-9999", "(71) 99999-9999", "5571999999999"
 * ou já no formato "whatsapp:+5571999999999" (como a Twilio envia no webhook).
 */
export function normalizeBrazilPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("0")) digits = digits.slice(1);

  if (digits.startsWith("55") && digits.length >= 12) {
    return `+${digits}`;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  return digits.startsWith("+") ? raw : `+${digits}`;
}

export function isWithinSessionWindow(lastInboundAt: Date): boolean {
  return Date.now() - lastInboundAt.getTime() < SESSION_WINDOW_MS;
}

/**
 * Envio de texto livre. Usado pelo BOT (sempre em resposta direta a uma
 * mensagem recebida, portanto sempre dentro da janela de 24h) e também
 * pelo admin quando ainda está dentro da janela.
 */
export async function sendFreeformWhatsApp(params: {
  toPhone: string;
  body: string;
}): Promise<SendResult> {
  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!client || !from) {
    return {
      success: false,
      error:
        "Twilio não configurado (defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM no .env).",
    };
  }

  const to = params.toPhone.startsWith("whatsapp:")
    ? params.toPhone
    : `whatsapp:${normalizeBrazilPhone(params.toPhone)}`;

  try {
    const message = await client.messages.create({ from, to, body: params.body });
    return { success: true, sid: message.sid };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro desconhecido ao enviar mensagem." };
  }
}

/**
 * Envio da resposta de um admin a uma dúvida. Verifica a janela de 24h:
 * - Se ainda estiver dentro da janela -> texto livre normal.
 * - Se já tiver passado -> tenta usar o Content Template (TWILIO_CONTENT_SID);
 *   se não houver template configurado, retorna erro explicando o motivo,
 *   sem tentar enviar (evita gastar a mensagem sabendo que será rejeitada).
 */
export async function sendWhatsAppReply(params: {
  toPhone: string;
  employeeName: string;
  replyText: string;
  lastInboundAt: Date;
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
  const withinWindow = isWithinSessionWindow(params.lastInboundAt);

  if (withinWindow) {
    const body = `Olá ${params.employeeName}! Aqui é a MAX Serviços respondendo sua dúvida:\n\n${params.replyText}`;
    try {
      const message = await client.messages.create({ from, to, body });
      return { success: true, sid: message.sid };
    } catch (err: any) {
      return { success: false, error: err?.message || "Erro desconhecido ao enviar mensagem." };
    }
  }

  // Janela de 24h expirada — só é possível reabrir com template aprovado.
  if (!contentSid) {
    return {
      success: false,
      requiresTemplate: true,
      error:
        "A janela de 24h do WhatsApp para esse colaborador expirou. Configure TWILIO_CONTENT_SID com um template aprovado pela Meta para reabrir a conversa (veja o README).",
    };
  }

  try {
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
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro desconhecido ao enviar mensagem." };
  }
}
