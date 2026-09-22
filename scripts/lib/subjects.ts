export interface Subject {
  key: string;
  label: string; // texto completo, usado no dashboard e nas mensagens de texto
  shortLabel: string; // até 24 caracteres — exigido pelo item da lista do WhatsApp
  menuDescription: string; // até 72 caracteres — subtítulo do item na lista
  defaultAiAutoReply: boolean; // pode a IA responder esse assunto sozinha, por padrão?
}

// Ordem exata usada no menu do WhatsApp (lista interativa e também no
// fallback em texto numerado). Se precisar adicionar/remover um assunto,
// mude só aqui — bot, dashboard e métricas usam essa mesma lista.
export const SUBJECTS: Subject[] = [
  {
    key: "ceremonia_lacracao",
    label: "Cerimônia de lacração e carregamento das urnas",
    shortLabel: "Lacração de urnas",
    menuDescription: "Cerimônia de lacração e carregamento das urnas",
    defaultAiAutoReply: true,
  },
  {
    key: "pagamento_beneficios",
    label: "Pagamento de benefícios",
    shortLabel: "Pagto. de benefícios",
    menuDescription: "Pagamento de benefícios",
    defaultAiAutoReply: false, // assunto financeiro — sempre humano por padrão
  },
  {
    key: "pagamento_salarios",
    label: "Pagamento de salários",
    shortLabel: "Pagto. de salários",
    menuDescription: "Pagamento de salários",
    defaultAiAutoReply: false, // assunto financeiro — sempre humano por padrão
  },
  {
    key: "salario_familia",
    label: "Pagamento de salário-família",
    shortLabel: "Salário-família",
    menuDescription: "Pagamento de salário-família",
    defaultAiAutoReply: false, // assunto financeiro — sempre humano por padrão
  },
  {
    key: "ponto_eletronico",
    label: "Ponto eletrônico",
    shortLabel: "Ponto eletrônico",
    menuDescription: "Ponto eletrônico",
    defaultAiAutoReply: true,
  },
  {
    key: "transporte_deslocamento",
    label: "Transporte e deslocamento",
    shortLabel: "Transporte/deslocamento",
    menuDescription: "Transporte e deslocamento",
    defaultAiAutoReply: true,
  },
  {
    key: "outros_assuntos",
    label: "Outros assuntos",
    shortLabel: "Outros assuntos",
    menuDescription: "Outros assuntos (descreva livremente)",
    defaultAiAutoReply: true,
  },
];

export function getSubjectLabel(key: string): string {
  return SUBJECTS.find((s) => s.key === key)?.label || key;
}

export function getSubject(key: string): Subject | undefined {
  return SUBJECTS.find((s) => s.key === key);
}

/**
 * Texto do menu em fallback numerado (usado só se a lista interativa do
 * WhatsApp não estiver configurada — veja TWILIO_MENU_CONTENT_SID).
 */
export function buildSubjectMenuText(): string {
  const lines = SUBJECTS.map((s, idx) => `${idx + 1} - ${s.label}`);
  return `Sobre qual assunto é a sua dúvida? Responda com o *número* da opção:\n\n${lines.join(
    "\n"
  )}`;
}

/**
 * Interpreta a resposta do colaborador ao menu: aceita o número da opção,
 * o payload exato de um item de lista/botão do WhatsApp, ou um texto que
 * combine parcialmente com o nome do assunto.
 */
export function matchSubjectFromReply(text: string): Subject | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const byKey = SUBJECTS.find((s) => s.key === trimmed);
  if (byKey) return byKey;

  const asNumber = parseInt(trimmed, 10);
  if (!isNaN(asNumber) && asNumber >= 1 && asNumber <= SUBJECTS.length) {
    return SUBJECTS[asNumber - 1];
  }

  const normalized = trimmed.toLowerCase();
  const byText = SUBJECTS.find(
    (s) =>
      s.label.toLowerCase().includes(normalized) ||
      s.shortLabel.toLowerCase().includes(normalized) ||
      normalized.includes(s.shortLabel.toLowerCase())
  );
  return byText || null;
}
