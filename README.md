# MAX Serviços — Central de Dúvidas (WhatsApp + IA de respostas automáticas)

Bot de atendimento automatizado dentro do WhatsApp: o colaborador manda uma
mensagem, escolhe o assunto em uma **lista interativa** (toca, não digita),
descreve a dúvida, e:

- Se já existirem respostas humanas parecidas o suficiente, uma **IA de
  similaridade de texto** (gratuita, roda no próprio servidor, sem API paga)
  responde automaticamente, reaproveitando uma resposta real já dada por um
  admin — nunca inventa texto novo.
- Senão, a dúvida cai no **dashboard interno** (fila geral) para um admin
  responder; a resposta é enviada automaticamente de volta pelo WhatsApp.

Tem também uma página de **Métricas** com gráficos animados (dia anterior /
semanal / mensal) mostrando quantas dúvidas chegaram, quantas foram
respondidas por humano, quantas pela IA, e quantas seguem pendentes.

Stack: **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Framer Motion + Recharts + Prisma + PostgreSQL (Supabase) + Twilio**. Pronto para deploy na **Vercel**.

---

## 1. Fluxo completo do colaborador

1. Manda qualquer mensagem para +55 71 8266-8840.
2. Bot saúda (fuso da Bahia) e pede o nome completo.
3. Colaborador informa o nome.
4. Bot envia uma **lista interativa** (toque em "Ver assuntos" → escolhe um dos 7 itens):
   ```
   Lacração de urnas
   Pagto. de benefícios
   Pagto. de salários
   Salário-família
   Ponto eletrônico
   Transporte/deslocamento
   Outros assuntos
   ```
   (Se a lista interativa ainda não estiver configurada — passo 4 da seção Twilio — o bot cai automaticamente para um menu numerado em texto, sem travar o atendimento.)
5. Colaborador escolhe o assunto.
6. Bot pede para descrever a dúvida; colaborador escreve.
7. **Aqui a IA entra em ação** (veja seção 3): se achar uma dúvida muito parecida já respondida por humano no mesmo assunto, responde na hora. Senão, confirma o recebimento e encaminha para o time.
8. Se a IA respondeu e o colaborador escrever de novo (não resolveu), o sistema automaticamente encaminha para um humano.
9. Admin responde pelo dashboard → resposta enviada automaticamente pelo WhatsApp.
10. Na próxima dúvida, o bot já pula a etapa do nome.

---

## 2. Painel administrativo

- `/admin/login` — login.
- `/admin/dashboard` — fila geral de dúvidas, chat com o histórico completo (inclusive o que a IA respondeu, com selo 🤖 e o número de telefone do colaborador sempre visível), filtro por assunto e por status.
- `/admin/metrics` — gráficos e KPIs (veja seção 4), e o painel de configuração da IA (só o usuário master vê os interruptores).

---

## 3. Como a IA de respostas automáticas funciona (gratuita, sem API paga)

Não é um modelo de linguagem generativo — é um mecanismo clássico de Machine
Learning chamado **TF-IDF + similaridade de cosseno** (`lib/similarity.ts`),
que roda inteiramente dentro do seu próprio servidor Next.js, sem chamar
nenhuma API externa paga.

Quando uma dúvida nova chega:
1. O sistema pega todas as dúvidas anteriores **do mesmo assunto** que já têm resposta humana.
2. Compara o texto da dúvida nova com cada uma delas (usando peso maior para palavras raras/específicas, menor para palavras comuns).
3. Se a mais parecida tiver uma similaridade acima do limite configurado (padrão: 80%) **e** já existir uma quantidade mínima de exemplos daquele assunto (padrão: 8), o bot reenvia **a resposta exata que um humano já deu** para aquela dúvida quase idêntica.
4. Caso contrário, vai para um humano — sem inventar nada.

Isso cria naturalmente o comportamento que vocês pediram: no início, com poucas dúvidas respondidas, a IA praticamente não responde sozinha; conforme os admins respondem mais dúvidas, ela passa a resolver as repetidas automaticamente.

**Segurança:** por padrão, os 3 assuntos financeiros (pagamento de salários, benefícios, salário-família) **nunca** são respondidos pela IA — sempre vão para um humano, pelo risco de erro em informação financeira. Isso é ajustável em `/admin/metrics`, só pelo usuário master.

Se o colaborador escrever de novo depois de uma resposta automática (sinal de que não resolveu), o sistema encaminha a dúvida para um humano automaticamente.

---

## 4. Página de Métricas

## 4.1 Atualizações em tempo real

O dashboard e a página de Métricas se atualizam sozinhos, na hora, quando:
- Chega uma dúvida nova.
- A IA responde uma dúvida automaticamente.
- Um admin responde uma dúvida.

Isso usa o **Supabase Realtime** (canal de "Broadcast") — grátis, já incluído no mesmo projeto do banco de dados, sem serviço novo pra contratar. O aviso em si não carrega nenhum dado sensível (nenhuma dúvida, nome ou telefone passa por ele); ele só avisa "algo mudou, atualize", e os dados de verdade continuam vindo pela rota autenticada de sempre.

Configure em `.env`:
```
NEXT_PUBLIC_SUPABASE_URL="https://SEU-PROJETO.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sua-chave-anon-publica"
```
Ambas ficam em **Project Settings → API** no Supabase (a "anon public" key é segura para expor no navegador — é assim que ela foi feita para ser usada). Não precisa habilitar nada mais no Supabase (esse canal não depende de replicação de tabela).

Se essas variáveis não estiverem configuradas, o sistema continua funcionando normalmente — só cai de volta no polling automático a cada 20 segundos (visível como "Modo intermitente" no canto do painel, em vez de "🟢 Ao vivo").


Em `/admin/metrics`:
- KPIs: dúvidas recebidas, respondidas por humano, respondidas por IA, pendentes, taxa de resposta, tempo médio de resposta.
- Gráfico de área empilhada, animado, trocando suavemente entre os períodos **Dia anterior / Semanal / Mensal**.
- Bloco "Desempenho da automação": quantas dúvidas a IA resolveu sozinha e uma estimativa de mensagens automatizadas pelo bot (essa última é uma estimativa — ~4 mensagens por ciclo completo do bot — não uma contagem exata mensagem a mensagem, isso fica claro na própria tela).
- Painel de configuração da IA (interruptor geral + por assunto), visível só para o usuário master.

---

## 4.2 Avaliação rápida, aprendizado por rejeição, anexos e busca avançada

**Avaliação rápida:** depois de QUALQUER resposta (de admin ou da IA), o bot pergunta automaticamente "Isso resolveu sua dúvida? Responda 1 para Sim ou 2 para Não". A resposta fica salva em `Question.satisfaction` e aparece como 👍/👎 no painel.

**Aprender com a rejeição:** se o colaborador avalia como "Não" uma dúvida que a IA respondeu sozinha, o sistema marca aquela resposta humana original (`Reply.excludedFromAi`) como "não reutilizável" — a IA para de sugeri-la para dúvidas parecidas no futuro. Nada é apagado do histórico, só para de ser usado como modelo. Se avaliar "Não" numa resposta humana, a dúvida simplesmente volta para a fila de um admin.

**Anexos:** o colaborador pode mandar foto/PDF/áudio junto da dúvida (inclusive sem digitar nada, só o anexo). As mídias da Twilio são privadas por padrão — o painel busca elas através de uma rota própria (`/api/attachments/:id`), autenticada por sessão de admin, sem nunca expor o link direto da Twilio.

**Busca avançada:** campo de busca por nome/telefone/palavra-chave no dashboard, mais um painel "Mais filtros" com: respondida por (humano/IA), avaliação do colaborador, período (de/até) e "só com anexo".

## 5. Pré-requisitos

- Node.js 18+.
- Conta no [Supabase](https://supabase.com) (banco de dados).
- Conta na [Twilio](https://www.twilio.com) com o número +55 71 8266-8840 registrado como **WhatsApp Sender**.
- Conta na [Vercel](https://vercel.com).

Não precisa de nenhuma conta/API paga além dessas — a IA de respostas automáticas é 100% local ao projeto.

---

## 6. Banco de dados (Supabase)

1. Crie um projeto no [Supabase](https://app.supabase.com).
2. **Project Settings → Database → Connection string**.
3. Modo **"Transaction" (porta 6543)** → `DATABASE_URL`, terminando com `?pgbouncer=true&connection_limit=1`.
4. Modo **"Session" (porta 5432)** → `DIRECT_URL`.
5. Se a senha tiver caracteres especiais, use a connection string pronta que o próprio Supabase mostra (evita erro de autenticação por codificação errada).

---

## 7. Rodando localmente

```bash
npm install
cp .env.example .env      # preencha com os valores reais
npx prisma db push        # cria/atualiza as tabelas no Supabase
npm run db:seed           # cria o usuário master (MATEUS / berrythedev45!)
npm run dev
```

Painel: `http://localhost:3000/admin/login`.

---

## 8. Configurando a Twilio (WhatsApp)

1. Crie a conta em [twilio.com](https://www.twilio.com).
2. Em **Messaging → Senders → WhatsApp senders**, registre o número **+55 71 8266-8840** (aprovação da Meta — dias a semanas, não depende do código).
3. Copie **Account SID** e **Auth Token** → `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN` no `.env`.
4. `TWILIO_WHATSAPP_FROM="whatsapp:+557182668840"`.
5. **Crie a lista interativa do menu** (uma única vez): com `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` já preenchidos no `.env`, rode:
   ```bash
   npm run setup:menu
   ```
   Isso cria o template de lista (não precisa de aprovação da Meta, só funciona dentro da janela de 24h — que é sempre o nosso caso) e imprime uma linha `TWILIO_MENU_CONTENT_SID="HX..."` — copie para o `.env` (local e Vercel).
6. No mesmo WhatsApp Sender, configure **"When a message comes in"**: método `POST`, URL `https://SEU-DOMINIO.vercel.app/api/whatsapp/webhook`.
7. **(Recomendado) Template para reabrir conversas após 24h:** crie em **Messaging → Content Template Builder**, envie para aprovação da Meta, e coloque o SID em `TWILIO_CONTENT_SID`. Sem isso, se um admin demorar mais de 24h para responder, a mensagem fica registrada com aviso no dashboard, mas não é entregue até esse template existir.

---

## 9. Deploy na Vercel

1. Suba para um repositório Git → **Add New → Project** na Vercel.
2. Em **Environment Variables**, adicione: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_MENU_CONTENT_SID`, `TWILIO_CONTENT_SID` (quando disponível), `TWILIO_VALIDATE_SIGNATURE=true`, `NEXT_PUBLIC_APP_URL`.
3. **Deploy**.
4. Rode `npm run db:seed` uma vez apontando para o banco de produção.
5. Atualize a URL do webhook na Twilio para o domínio final da Vercel.

---

## 10. Custos e prazos (fora do meu controle)

- **Twilio:** cobra por mensagem enviada/recebida via WhatsApp (confira [twilio.com/whatsapp/pricing](https://www.twilio.com/en-us/whatsapp/pricing) para valores atuais no Brasil).
- **Aprovação da Meta** do número: dias a semanas, não acelera por código.
- **Supabase:** plano gratuito deve cobrir o volume esperado.
- **IA de respostas automáticas:** sem custo adicional — roda dentro do próprio servidor, sem API paga.

---

## 11. Segurança

- `/api/whatsapp/webhook` valida a assinatura oficial da Twilio (`X-Twilio-Signature`).
- Senhas com hash **bcrypt**; sessão em **JWT + cookie httpOnly** (12h).
- Apenas o usuário master cria administradores e ajusta as configurações da IA.
- `/admin/dashboard` e `/admin/metrics` protegidos por `middleware.ts`.
- As respostas automáticas da IA ficam registradas no histórico com um selo visível (🤖), nunca escondidas — total transparência sobre quem respondeu o quê.

---

## 12. Estrutura do projeto

```
app/
  page.tsx                            → redireciona "/" para /admin/login
  admin/
    login/page.tsx
    dashboard/page.tsx, DashboardClient.tsx   → fila geral, chat, selo de IA
    metrics/page.tsx, MetricsClient.tsx       → KPIs, gráfico animado, config. da IA
  api/
    whatsapp/webhook/route.ts         → BOT: recebe mensagens, decide IA vs humano
    questions/route.ts                → GET lista dúvidas (admin)
    questions/[id]/reply/route.ts     → responde dúvida + WhatsApp + libera conversa
    metrics/route.ts                  → KPIs e série temporal por período
    admin/ai-settings/route.ts        → interruptores da IA (master)
    admin/users/route.ts, auth/*
    attachments/[id]/route.ts         → proxy autenticado para mídias da Twilio
lib/
  prisma.ts, auth.ts, whatsapp.ts
  subjects.ts                         → lista de assuntos (labels curtos p/ WhatsApp + permissão de IA)
  similarity.ts                       → motor TF-IDF + cosseno (a "IA")
  ai-matcher.ts                       → decide se e como a IA responde
  ai-settings.ts                      → interruptores (Setting key/value no banco)
  realtime.ts                         → aviso instantâneo via Supabase Broadcast
  greeting.ts
prisma/schema.prisma                  → AdminUser, Conversation, Question, Reply, Setting, ProcessedMessage
scripts/
  seed.ts                             → cria o usuário master
  create-whatsapp-menu.ts             → cria a lista interativa na Twilio (rodar 1x)
middleware.ts
```

---

## 13. Possíveis melhorias futuras

- Editar a resposta sugerida pela IA antes de enviar, em vez de só aprovar/rejeitar.
- Exportar as métricas em CSV/PDF.
- Atribuir automaticamente um admin responsável por assunto (hoje é fila geral).
- Ajustar o limiar de confiança e o mínimo de exemplos diretamente pela tela (hoje têm valores padrão sensatos, ajustáveis só editando a tabela `Setting` diretamente).

---

## 14. Bugs corrigidos nas últimas rodadas de teste

- Gráfico de métricas: datas sem zero à esquerda quebravam silenciosamente o período "Dia anterior".
- Meia-noite podia sumir do gráfico ou virar hora inválida, por uma peculiaridade de formatação do navegador/servidor.
- Colaborador mandando foto/áudio sem legenda escolhia o assunto errado (o primeiro da lista) sem querer.
- Ordem de mensagens do bot trocada (saudação chegando depois do menu).
- Usuário-sistema da IA aparecia misturado na lista de administradores do painel.
- Chat "puxava" a rolagem pra baixo a cada atualização automática, mesmo com o admin lendo mensagens antigas.
- Sem proteção contra a Twilio reenviar a mesma mensagem (podia duplicar uma dúvida).
- Dúvida virava "respondida" mesmo quando o envio ao WhatsApp falhava de verdade (tanto no caminho do admin quanto no caminho da IA) — corrigido para só marcar como respondida quando a entrega é confirmada.
- Estatística "respondidas" no painel nunca contava certo, porque o campo que marca quem respondeu (`resolvedBy`) não estava sendo preenchido no caminho do admin.