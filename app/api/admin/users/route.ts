import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies, hashPassword } from "@/lib/auth";

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "O usuário precisa ter pelo menos 3 caracteres.")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou underline."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

// GET -> lista administradores (qualquer admin logado pode ver a lista)
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const users = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, isMaster: true, createdAt: true },
  });

  return NextResponse.json({ users });
}

// POST -> cria um novo administrador (somente o usuário master)
export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!session.isMaster) {
    return NextResponse.json(
      { error: "Apenas o usuário master pode criar novos administradores." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const existing = await prisma.adminUser.findUnique({
      where: { username: parsed.data.username },
    });
    if (existing) {
      return NextResponse.json({ error: "Esse usuário já existe." }, { status: 409 });
    }

    const hashed = await hashPassword(parsed.data.password);
    const user = await prisma.adminUser.create({
      data: {
        username: parsed.data.username,
        password: hashed,
        isMaster: false,
      },
      select: { id: true, username: true, isMaster: true, createdAt: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/admin/users]", err);
    return NextResponse.json({ error: "Erro interno ao criar usuário." }, { status: 500 });
  }
}
