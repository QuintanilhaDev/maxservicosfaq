import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { comparePassword, signSession, SESSION_COOKIE_NAME } from "@/lib/auth";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Informe usuário e senha." }, { status: 400 });
    }

    const { username, password } = parsed.data;

    const admin = await prisma.adminUser.findUnique({
      where: { username: username.trim() },
    });

    if (!admin) {
      return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    }

    const passwordOk = await comparePassword(password, admin.password);
    if (!passwordOk) {
      return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    }

    const token = await signSession({
      sub: admin.id,
      username: admin.username,
      isMaster: admin.isMaster,
    });

    const res = NextResponse.json({
      user: { username: admin.username, isMaster: admin.isMaster },
    });

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12h
    });

    return res;
  } catch (err) {
    console.error("[POST /api/auth/login]", err);
    return NextResponse.json({ error: "Erro interno ao fazer login." }, { status: 500 });
  }
}
