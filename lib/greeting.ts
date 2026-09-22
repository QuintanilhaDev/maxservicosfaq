/**
 * Retorna a saudação (Bom dia / Boa tarde / Boa noite) com base no horário
 * LOCAL do dispositivo de quem está acessando a página (new Date() já usa o
 * fuso horário do navegador do visitante). Caso o visitante esteja na Bahia,
 * isso corresponde naturalmente ao fuso America/Bahia.
 *
 * Faixas:
 *  05:00–11:59 -> Bom dia
 *  12:00–17:59 -> Boa tarde
 *  18:00–04:59 -> Boa noite
 */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Versão usada no BOT (rodando no servidor, sem "dispositivo do visitante").
 * Aqui fixamos o fuso horário da Bahia (America/Bahia), como pedido no
 * projeto original, já que não existe navegador/timezone de cliente em um
 * webhook do WhatsApp.
 */
export function getGreetingBahia(): string {
  const hourStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Bahia",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date());

  const hour = parseInt(hourStr, 10);

  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}
