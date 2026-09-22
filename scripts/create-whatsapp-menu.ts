import "dotenv/config";
import { SUBJECTS } from "../lib/subjects";

/**
 * Roda UMA VEZ (npm run setup:menu) para criar, via Content API da Twilio,
 * o template de "lista interativa" com os 7 assuntos. Esse tipo de conteúdo
 * (twilio/list-picker) NÃO precisa de aprovação da Meta, porque só pode ser
 * enviado dentro da janela de 24h de uma conversa já iniciada pelo
 * colaborador — exatamente o que o bot faz.
 *
 * Depois de rodar, copie o "sid" (começa com HX...) impresso no final para
 * TWILIO_MENU_CONTENT_SID no seu .env (local e na Vercel).
 */

async function main() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.error(
      "Defina TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN no seu .env antes de rodar este script."
    );
    process.exitCode = 1;
    return;
  }

  const items = SUBJECTS.map((s) => ({
    item: s.shortLabel,
    id: s.key,
    description: s.menuDescription,
  }));

  const body = {
    friendly_name: `max_servicos_menu_assuntos_${Date.now()}`,
    language: "pt_BR",
    types: {
      "twilio/list-picker": {
        body: "Sobre qual assunto é a sua dúvida?",
        button: "Ver assuntos",
        items,
      },
    },
  };

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const res = await fetch("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Erro ao criar o template na Twilio:", data);
    process.exitCode = 1;
    return;
  }

  console.log("✔ Menu interativo criado com sucesso!");
  console.log("");
  console.log("Copie esta linha para o seu .env (local e na Vercel):");
  console.log("");
  console.log(`TWILIO_MENU_CONTENT_SID="${data.sid}"`);
  console.log("");
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exitCode = 1;
});