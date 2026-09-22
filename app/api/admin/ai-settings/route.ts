import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth";
import {
  getAllAiSettings,
  setMasterAiEnabled,
  setSubjectAiEnabled,
  setSimilarityThreshold,
  setMinExamples,
} from "@/lib/ai-settings";
import { SUBJECTS } from "@/lib/subjects";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const settings = await getAllAiSettings();
  return NextResponse.json(settings);
}

const updateSchema = z.object({
  masterEnabled: z.boolean().optional(),
  similarityThreshold: z.number().min(0.5).max(0.99).optional(),
  minExamples: z.number().int().min(1).max(1000).optional(),
  subject: z
    .object({
      key: z.string(),
      enabled: z.boolean(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!session.isMaster) {
    return NextResponse.json(
      { error: "Apenas o usuário master pode alterar as configurações da IA." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos." },
      { status: 400 }
    );
  }

  const { masterEnabled, similarityThreshold, minExamples, subject } = parsed.data;

  if (masterEnabled !== undefined) await setMasterAiEnabled(masterEnabled);
  if (similarityThreshold !== undefined) await setSimilarityThreshold(similarityThreshold);
  if (minExamples !== undefined) await setMinExamples(minExamples);
  if (subject) {
    const valid = SUBJECTS.some((s) => s.key === subject.key);
    if (!valid) {
      return NextResponse.json({ error: "Assunto inválido." }, { status: 400 });
    }
    await setSubjectAiEnabled(subject.key, subject.enabled);
  }

  const settings = await getAllAiSettings();
  return NextResponse.json(settings);
}
