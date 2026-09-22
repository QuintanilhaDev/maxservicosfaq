import { prisma } from "./prisma";
import { SUBJECTS } from "./subjects";

const MASTER_SWITCH_KEY = "ai_master_enabled";
const THRESHOLD_KEY = "ai_similarity_threshold";
const MIN_EXAMPLES_KEY = "ai_min_examples";

const DEFAULT_THRESHOLD = 0.8; // 0 a 1 — quão parecida a pergunta precisa ser
const DEFAULT_MIN_EXAMPLES = 8; // mínimo de dúvidas já respondidas por humano naquele assunto

function subjectKeyName(subjectKey: string): string {
  return `ai_subject_${subjectKey}`;
}

async function readValue(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function isMasterAiEnabled(): Promise<boolean> {
  const v = await readValue(MASTER_SWITCH_KEY);
  return v === null ? true : v === "true";
}

export async function isSubjectAiEnabled(subjectKey: string): Promise<boolean> {
  const v = await readValue(subjectKeyName(subjectKey));
  if (v !== null) return v === "true";
  const subject = SUBJECTS.find((s) => s.key === subjectKey);
  return subject?.defaultAiAutoReply ?? false;
}

export async function getSimilarityThreshold(): Promise<number> {
  const v = await readValue(THRESHOLD_KEY);
  const parsed = v ? parseFloat(v) : NaN;
  return isNaN(parsed) ? DEFAULT_THRESHOLD : parsed;
}

export async function getMinExamples(): Promise<number> {
  const v = await readValue(MIN_EXAMPLES_KEY);
  const parsed = v ? parseInt(v, 10) : NaN;
  return isNaN(parsed) ? DEFAULT_MIN_EXAMPLES : parsed;
}

export async function getAllAiSettings() {
  const [master, threshold, minExamples, subjectRows] = await Promise.all([
    isMasterAiEnabled(),
    getSimilarityThreshold(),
    getMinExamples(),
    Promise.all(
      SUBJECTS.map(async (s) => ({
        key: s.key,
        label: s.label,
        enabled: await isSubjectAiEnabled(s.key),
      }))
    ),
  ]);

  return { masterEnabled: master, similarityThreshold: threshold, minExamples, subjects: subjectRows };
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function setMasterAiEnabled(enabled: boolean) {
  await setSetting(MASTER_SWITCH_KEY, String(enabled));
}

export async function setSubjectAiEnabled(subjectKey: string, enabled: boolean) {
  await setSetting(subjectKeyName(subjectKey), String(enabled));
}

export async function setSimilarityThreshold(value: number) {
  await setSetting(THRESHOLD_KEY, String(value));
}

export async function setMinExamples(value: number) {
  await setSetting(MIN_EXAMPLES_KEY, String(value));
}
