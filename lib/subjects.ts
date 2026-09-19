export interface Subject {
  key: string;
  label: string;
}

// Ordem exata usada no menu numerado enviado pelo WhatsApp.
// Se precisar adicionar/remover um assunto, mude só aqui — o bot e o
// dashboard usam essa mesma lista.
export const SUBJECTS: Subject[] = [
  { key: "ceremonia_lacracao", label: "Cerimônia de lacração e carregamento das urnas" },
  { key: "pagamento_beneficios", label: "Pagamento de benefícios" },
  { key: "pagamento_salarios", label: "Pagamento de salários" },
  { key: "salario_familia", label: "Pagamento de salário-família" },
  { key: "ponto_eletronico", label: "Ponto eletrônico" },
  { key: "transporte_deslocamento", label: "Transporte e deslocamento" },
  { key: "outros_assuntos", label: "Outros assuntos" },
];

export function getSubjectLabel(key: string): string {
  return SUBJECTS.find((s) => s.key === key)?.label || key;
}

/**
 * Monta o texto do menu numerado enviado pelo WhatsApp.
 * Ex:
 * 1 - Cerimônia de lacração e carregamento das urnas
 * 2 - Pagamento de benefícios
 * ...
 */
export function buildSubjectMenuText(): string {
  const lines = SUBJECTS.map((s, idx) => `${idx + 1} - ${s.label}`);
  return `Sobre qual assunto é a sua dúvida? Responda com o *número* da opção:\n\n${lines.join(
    "\n"
  )}`;
}

/**
 * Interpreta a resposta do colaborador ao menu: aceita o número da opção
 * ou, como fallback, um texto que combine parcialmente com o nome do assunto.
 */
export function matchSubjectFromReply(text: string): Subject | null {
  const trimmed = text.trim();

  const asNumber = parseInt(trimmed, 10);
  if (!isNaN(asNumber) && asNumber >= 1 && asNumber <= SUBJECTS.length) {
    return SUBJECTS[asNumber - 1];
  }

  const normalized = trimmed.toLowerCase();
  const byText = SUBJECTS.find((s) => s.label.toLowerCase().includes(normalized));
  return byText || null;
}
