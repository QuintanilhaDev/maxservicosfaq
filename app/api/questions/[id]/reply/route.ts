import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { sendWhatsAppReply, sendFreeformWhatsApp } from "@/lib/whatsapp";
import { broadcastDashboardEvent } from "@/lib/realtime";

const replySchema = z.object({
  text: z.string().trim().min(1, "A resposta não pode ficar vazia.").max(4000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = replySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const question = await prisma.question.findUnique({
      where: { id: params.id },
    });

    if (!question) {
      return NextResponse.json({ error: "Dúvida não encontrada." }, { status: 404 });
    }

    // Envia a resposta pelo WhatsApp para o telefone cadastrado pelo funcionário.
    // sendWhatsAppReply já verifica sozinho se ainda estamos dentro da janela
    // de 24h desde a última mensagem do colaborador (question.lastInboundAt).
    const whatsappResult = await sendWhatsAppReply({
      toPhone: question.phone,
      employeeName: question.name,
      replyText: parsed.data.text,
      lastInboundAt: question.lastInboundAt,
    });

    const reply = await prisma.reply.create({
      data: {
        questionId: question.id,
        text: parsed.data.text,
        adminUserId: session.sub,
        sentToWhatsApp: whatsappResult.success,
        whatsappError: whatsappResult.success ? null : whatsappResult.error,
      },
      include: { adminUser: { select: { username: true } } },
    });

    await prisma.question.update({
      where: { id: question.id },
      data: whatsappResult.success
        ? { status: "answered", resolvedBy: "admin" }
        : {}, // envio falhou: mantém como pendente, para não sumir da fila
    });

    // Depois de uma resposta entregue com sucesso, manda o pedido de
    // avaliação rápida e deixa a conversa aguardando essa resposta —
    // se o colaborador avaliar negativamente, a dúvida volta pra fila.
    if (whatsappResult.success) {
      await sendFreeformWhatsApp({
        toPhone: question.phone,
        body: "Isso resolveu sua dúvida? Responda *1* para Sim ou *2* para Não.",
      });

      await prisma.conversation
        .update({
          where: { phone: question.phone },
          data: { stage: "AWAITING_RATING", activeQuestionId: question.id },
        })
        .catch(() => null); // não quebra a resposta se a conversa não existir mais

      await broadcastDashboardEvent({ type: "question_answered_admin", subject: question.subject });
    }

    return NextResponse.json({
      reply,
      whatsapp: whatsappResult,
    });
  } catch (err) {
    console.error("[POST /api/questions/:id/reply]", err);
    return NextResponse.json(
      { error: "Erro interno ao enviar a resposta." },
      { status: 500 }
    );
  }
}
