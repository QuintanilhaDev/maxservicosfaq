import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * TEMPO REAL (Supabase Broadcast)
 * ---------------------------------------------------------------------------
 * Usamos o canal de Broadcast do Supabase Realtime só como um "toque de
 * campainha": quando algo muda (dúvida nova, resposta enviada), o servidor
 * manda um aviso pequeno e sem dados sensíveis ("mudou algo no assunto X")
 * pelo canal. Quem está com o painel aberto recebe esse aviso na hora e
 * busca os dados de verdade pela rota autenticada de sempre (/api/questions).
 *
 * Por quê é seguro usar a chave pública (anon key) aqui, tanto no servidor
 * quanto no navegador: o canal de Broadcast NÃO dá acesso de leitura às
 * tabelas do banco — ele só entrega a mensagem curta que o próprio servidor
 * decidiu mandar. Nenhuma dúvida, nome ou telefone passa por aqui.
 *
 * Se a variável de ambiente não estiver configurada, tudo continua
 * funcionando normalmente — só sem o aviso instantâneo (o painel cai de
 * volta no polling a cada alguns segundos, que já existia antes).
 */

export const DASHBOARD_CHANNEL = "dashboard-updates";

export type DashboardEvent =
  | { type: "question_created"; subject: string }
  | { type: "question_answered_ai"; subject: string }
  | { type: "question_answered_admin"; subject: string };

let cachedClient: SupabaseClient | null | undefined;

export function getRealtimeClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    cachedClient = null;
    return null;
  }

  cachedClient = createClient(url, anonKey, {
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return cachedClient;
}

/**
 * Publica um aviso no canal do dashboard. Chamado do SERVIDOR (webhook do
 * WhatsApp, rota de resposta) depois de criar/atualizar uma dúvida.
 * Nunca lança erro — se o Realtime falhar por qualquer motivo, a função
 * principal (responder a dúvida, etc.) não pode quebrar por causa disso.
 */
export async function broadcastDashboardEvent(event: DashboardEvent): Promise<void> {
  const client = getRealtimeClient();
  if (!client) return;

  try {
    const channel = client.channel(DASHBOARD_CHANNEL);
    // Mandar antes de "subscribe" usa HTTP direto — não precisa manter
    // conexão aberta, funciona bem numa function serverless.
    await channel.send({
      type: "broadcast",
      event: "update",
      payload: event,
    });
    await client.removeChannel(channel);
  } catch (err) {
    console.error("[realtime] Falha ao publicar aviso (não crítico):", err);
  }
}
