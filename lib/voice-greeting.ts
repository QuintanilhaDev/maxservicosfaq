import { getGreetingBahia } from "./greeting";

/**
 * SAUDAÇÃO POR VOZ (Web Speech API do navegador — grátis, sem API paga)
 * ---------------------------------------------------------------------------
 * Fala "Bom dia/Boa tarde/Boa noite, [Nome]" assim que o admin acessa o
 * painel, escolhendo automaticamente a MELHOR voz em português que o
 * navegador/sistema operacional daquele computador já tiver instalada.
 *
 * Qualidade da voz depende do navegador/sistema de quem está acessando —
 * isso está fora do nosso controle (não tem servidor de voz envolvido).
 * Navegadores/sistemas com vozes "Natural"/"Neural"/"Enhanced" instaladas
 * (ex: Microsoft Edge no Windows, Safari no Mac) soam naturais. Sem nenhuma
 * voz em português instalada, o navegador usa a voz padrão dele mesmo.
 */

const SESSION_FLAG_KEY = "max_voice_greeted";

function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const existing = synth.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

    let resolved = false;
    const handler = () => {
      if (resolved) return;
      resolved = true;
      synth.removeEventListener("voiceschanged", handler);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", handler);

    // Alguns navegadores (principalmente mais antigos/Safari) não disparam
    // o evento de forma confiável — depois de 1s, segue com o que tiver.
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      synth.removeEventListener("voiceschanged", handler);
      resolve(synth.getVoices());
    }, 1000);
  });
}

const QUALITY_MARKERS = ["natural", "neural", "enhanced", "premium", "online"];

// Nomes femininos comuns entre as vozes em português dos principais
// sistemas (Microsoft Edge/Windows, Apple/macOS, Google/Android).
const FEMALE_NAME_HINTS = [
  "francisca",
  "maria",
  "luciana",
  "camila",
  "fernanda",
  "raquel",
  "joana",
  "helena",
  "carla",
  "beatriz",
  "vitoria",
  "vitória",
  "livia",
  "lívia",
  "female",
];

const MALE_NAME_HINTS = ["daniel", "miguel", "pedro", "ricardo", "felipe", "joão", "joao", "male"];

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.toLowerCase();
  if (!lang.startsWith("pt")) return -1000; // não é português, descarta

  const name = voice.name.toLowerCase();
  let score = lang === "pt-br" ? 10 : 5;

  for (const marker of QUALITY_MARKERS) {
    if (name.includes(marker)) score += marker === "online" ? 20 : 45;
  }
  if (FEMALE_NAME_HINTS.some((hint) => name.includes(hint))) score += 15;
  if (MALE_NAME_HINTS.some((hint) => name.includes(hint))) score -= 12;
  if (voice.localService) score += 2; // um pouco mais rápida, não depende de rede

  return score;
}

function pickBestPortugueseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const candidates = voices
    .map((voice) => ({ voice, score: scoreVoice(voice) }))
    .filter((v) => v.score > -1000)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.voice ?? null;
}

export async function speakGreeting(displayName: string): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    const voices = await getVoicesAsync();
    const voice = pickBestPortugueseVoice(voices);
    const greeting = getGreetingBahia();

    const utterance = new SpeechSynthesisUtterance(`${greeting}, ${displayName}`);
    utterance.lang = "pt-BR";
    if (voice) utterance.voice = voice;
    utterance.rate = 0.98; // ritmo levemente mais natural que o padrão
    utterance.pitch = 1.05; // tom levemente mais agudo (voz feminina), sem exagero
    utterance.volume = 1;

    window.speechSynthesis.cancel(); // evita sobrepor com alguma fala pendente
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("[voice-greeting] Falha ao falar a saudação (não crítico):", err);
  }
}

/**
 * Fala a saudação só UMA VEZ por sessão do navegador (aba) — assim ela soa
 * no primeiro acesso ao painel depois do login, mas não repete toda vez que
 * o admin navega entre Dashboard e Métricas. Abrir uma aba nova ou logar de
 * novo depois de sair conta como uma sessão nova.
 */
export function speakLoginGreetingOnce(displayName: string): void {
  if (typeof window === "undefined") return;

  try {
    if (sessionStorage.getItem(SESSION_FLAG_KEY)) return;
    sessionStorage.setItem(SESSION_FLAG_KEY, "1");
  } catch {
    // sessionStorage indisponível (ex: modo privado) — segue e tenta falar mesmo assim
  }

  speakGreeting(displayName);
}
