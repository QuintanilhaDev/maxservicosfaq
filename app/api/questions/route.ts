import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

// GET /api/questions -> lista todas as dúvidas + respostas (somente admin logado).
// Não existe mais POST público aqui: as dúvidas agora só são criadas pelo
// bot do WhatsApp (veja app/api/whatsapp/webhook/route.ts).
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const questions = await prisma.question.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        replies: {
          orderBy: { createdAt: "asc" },
          include: { adminUser: { select: { username: true } } },
        },
      },
    });

    return NextResponse.json({ questions });
  } catch (err) {
    console.error("[GET /api/questions]", err);
    return NextResponse.json(
      { error: "Erro ao carregar as dúvidas." },
      { status: 500 }
    );
  }
}
