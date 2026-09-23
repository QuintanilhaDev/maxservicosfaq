import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

/**
 * GET /api/attachments/:id
 * ---------------------------------------------------------------------------
 * As URLs de mídia da Twilio (fotos, PDFs, áudios mandados pelo colaborador)
 * exigem autenticação Basic (Account SID + Auth Token) para serem abertas —
 * não são links públicos. Essa rota busca o anexo no servidor (com essas
 * credenciais) e entrega o conteúdo só para administradores já logados,
 * mantendo o anexo privado o tempo todo.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const attachment = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!attachment) {
    return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: "Twilio não configurado." }, { status: 500 });
  }

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const twilioRes = await fetch(attachment.url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!twilioRes.ok || !twilioRes.body) {
      return NextResponse.json({ error: "Não foi possível carregar o anexo." }, { status: 502 });
    }

    return new NextResponse(twilioRes.body, {
      status: 200,
      headers: {
        "Content-Type": attachment.contentType || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[GET /api/attachments/:id]", err);
    return NextResponse.json({ error: "Erro ao carregar o anexo." }, { status: 500 });
  }
}
