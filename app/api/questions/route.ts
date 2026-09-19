import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo.").max(150),
  phone: z.string().trim().min(8, "Informe um telefone válido.").max(30),
  message: z.string().trim().min(5, "Descreva sua dúvida com um pouco mais de detalhe.").max(4000),
});

// POST /api/questions -> qualquer funcionário pode enviar uma dúvida (rota pública)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Dados inválidos.";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const question = await prisma.question.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        message: parsed.data.message,
      },
    });

    return NextResponse.json({ id: question.id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/questions]", err);
    return NextResponse.json(
      { error: "Erro interno ao registrar sua dúvida. Tente novamente." },
      { status: 500 }
    );
  }
}

// GET /api/questions -> lista todas as dúvidas + respostas (somente admin logado)
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
