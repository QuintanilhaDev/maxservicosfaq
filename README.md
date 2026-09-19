# MAX Serviços — Central de Dúvidas (atendimento pelo WhatsApp)

Bot de atendimento automatizado dentro do próprio WhatsApp: o colaborador
manda uma mensagem, recebe uma saudação, informa o nome, escolhe o assunto
em um menu e descreve a dúvida — tudo isso sem sair do WhatsApp. A dúvida
cai em um painel interno, onde qualquer administrador pode responder; a
resposta é enviada automaticamente de volta pelo WhatsApp.

- **Bot no WhatsApp** — todo o atendimento do colaborador acontece por lá (nenhum link, nenhum formulário externo).
- **Dashboard admin** (`/admin/dashboard`) — ferramenta interna: fila geral de dúvidas (qualquer admin logado responde qualquer assunto), organizadas por assunto, com histórico de conversa estilo chat.
- **Envio de respostas via WhatsApp** através da Twilio, para o número que o bot já capturou automaticamente durante a conversa.

Stack: **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Framer Motion + Prisma + PostgreSQL (Supabase) + Twilio**. Pronto para deploy na **Vercel**.

---

## 1. Como funciona o fluxo do colaborador (dentro do WhatsApp)

1. Colaborador manda qualquer mensagem para +55 71 8266-8840.
2. Bot responde com saudação (Bom dia/Boa tarde/Boa noite, fuso da Bahia) e pede o nome completo.
3. Colaborador informa o nome.
4. Bot envia o menu numerado de assuntos:
   ```
   1 - Cerimônia de lacração e carregamento das urnas
   2 - Pagamento de benefícios
   3 - Pagamento de salários
   4 - Pagamento de salário-família
   5 - Ponto eletrônico
   6 - Transporte e deslocamento
   7 - Outros assuntos
   ```
5. Colaborador responde com o número da opção.
6. Bot pede para descrever a dúvida.
7. Colaborador escreve a dúvida.
8. Bot confirma o recebimento automaticamente.
9. A dúvida cai no dashboard interno, na fila geral, marcada com o assunto escolhido.
10. Um administrador responde pelo dashboard → a resposta é enviada automaticamente pelo WhatsApp do colaborador.
11. Se o colaborador mandar uma nova dúvida depois, o bot já pula a etapa do nome (ele já foi salvo) e vai direto para o menu de assuntos.

---

## 2. Pré-requisitos

- Node.js 18+.
- Conta no [Supabase](https://supabase.com) (banco de dados).
- Conta na [Twilio](https://www.twilio.com) com o número +55 71 8266-8840 registrado como **WhatsApp Sender**.
- Conta na [Vercel](https://vercel.com).

---

## 3. Banco de dados (Supabase)

1. Crie um projeto no [Supabase](https://app.supabase.com).
2. **Project Settings → Database → Connection string**.
3. Modo **"Transaction" (porta 6543)** → `DATABASE_URL`. **Não esqueça** de adicionar `?pgbouncer=true&connection_limit=1` no final — sem isso o Prisma quebra com erro de "prepared statement already exists" contra o pooler do Supabase.
4. Modo **"Session" (porta 5432)** → `DIRECT_URL`.
5. Se a senha do banco tiver caracteres especiais (`!`, `@`, `#`, etc.), use a connection string **pronta** que o próprio Supabase mostra na tela (já vem corretamente codificada) em vez de montar a URL manualmente.

---

## 4. Rodando localmente

```bash
npm install
cp .env.example .env      # preencha com os valores reais
npx prisma db push        # cria as tabelas no Supabase
npm run db:seed           # cria o usuário master (MATEUS / berrythedev45!)
npm run dev
```

Painel: `http://localhost:3000/admin/login` (usuário `MATEUS`, senha `berrythedev45!` — troque assim que possível).

Para testar o bot localmente, você precisa expor sua máquina publicamente (ex: [ngrok](https://ngrok.com) ou [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)) e configurar essa URL temporária como webhook na Twilio (passo 5). Nesse cenário, coloque `TWILIO_VALIDATE_SIGNATURE=false` no `.env` local, já que o domínio muda a cada execução do túnel.

---

## 5. Configurando a Twilio (WhatsApp)

1. Crie a conta em [twilio.com](https://www.twilio.com).
2. Em **Messaging → Senders → WhatsApp senders**, registre o número **+55 71 8266-8840** (passa por aprovação da Meta — pode levar de alguns dias a algumas semanas, isso não depende do código, é um processo da Twilio/Meta).
3. Copie **Account SID** e **Auth Token** (painel principal) → `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN` no `.env`.
4. `TWILIO_WHATSAPP_FROM="whatsapp:+557182668840"`.
5. No mesmo WhatsApp Sender, configure **"When a message comes in"**:
   - Método: `POST`
   - URL: `https://SEU-DOMINIO.vercel.app/api/whatsapp/webhook`
6. **(Recomendado) Template para reabrir conversas após 24h:** crie um Content Template em **Messaging → Content Template Builder** (ex: `"Olá {{1}}, sobre sua dúvida: {{2}}"`), envie para aprovação da Meta, e coloque o SID (`HXxxxxxxxx`) em `TWILIO_CONTENT_SID`. Sem isso, se um admin demorar mais de 24h para responder uma dúvida, o envio falha e fica registrado no dashboard com um aviso — nada se perde, mas a mensagem não chega ao colaborador até esse template existir.

**Importante sobre a janela de 24h:** diferente da versão anterior deste projeto (que usava formulário web), agora quem inicia a conversa é sempre o colaborador — então, **respondendo dentro de 24h**, tudo funciona com texto livre, sem necessidade de template aprovado. O template só entra em cena se um admin demorar mais que isso para responder.

---

## 6. Deploy na Vercel

1. Suba o projeto para um repositório Git.
2. Na Vercel: **Add New → Project** → importe o repositório.
3. Em **Environment Variables**, adicione: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_CONTENT_SID` (quando disponível), `TWILIO_VALIDATE_SIGNATURE=true`, `NEXT_PUBLIC_APP_URL`.
4. **Deploy**.
5. Rode `npm run db:seed` uma vez apontando para o banco de produção (mesmo `DATABASE_URL`/`DIRECT_URL` de produção no seu `.env` local).
6. Volte à Twilio e atualize a URL do webhook (passo 5.5) para `https://seu-projeto.vercel.app/api/whatsapp/webhook`.
7. Acesse `https://seu-projeto.vercel.app/admin/login`.

---

## 7. Custos e prazos (fora do meu controle)

- **Twilio:** cobra por mensagem/conversa enviada e recebida via WhatsApp (valor varia por país — confira a página de preços oficial da Twilio para o Brasil antes de aprovar o orçamento).
- **Aprovação da Meta** do número como WhatsApp Sender: normalmente alguns dias úteis, às vezes mais — não é algo que se acelera via código.
- **Supabase:** o plano gratuito deve cobrir o volume esperado de uma central de dúvidas interna; migrar de plano só seria necessário com um volume bem maior de mensagens/armazenamento.

---

## 8. Segurança

- Toda requisição recebida em `/api/whatsapp/webhook` é validada contra a assinatura oficial da Twilio (`X-Twilio-Signature`), rejeitando qualquer chamada que não venha realmente da Twilio.
- Senhas de administradores com hash **bcrypt**.
- Sessão de admin em **JWT + cookie httpOnly** (12h).
- Apenas o usuário **master** cria novos administradores.
- `/admin/dashboard` protegido por `middleware.ts`.

---

## 9. Estrutura do projeto

```
app/
  page.tsx                          → redireciona "/" para /admin/login (sem formulário público)
  admin/
    login/page.tsx                  → tela de login
    dashboard/page.tsx              → valida sessão (server component)
    dashboard/DashboardClient.tsx   → chat/dashboard: fila geral, filtro por assunto, aviso de janela 24h
  api/
    whatsapp/webhook/route.ts       → BOT: recebe mensagens da Twilio e conduz a conversa
    questions/route.ts              → GET lista dúvidas (admin)
    questions/[id]/reply/route.ts   → responde dúvida + envia WhatsApp + libera conversa
    auth/login/route.ts, auth/logout/route.ts
    admin/users/route.ts            → lista/cria administradores (master)
lib/
  prisma.ts, auth.ts                → banco e autenticação
  whatsapp.ts                       → integração Twilio (texto livre + template pós-24h)
  subjects.ts                       → lista de assuntos do menu (única fonte, usada pelo bot e pelo dashboard)
  greeting.ts                       → saudação por horário (fuso da Bahia, no bot)
prisma/schema.prisma                → AdminUser, Conversation (estado do bot), Question, Reply
scripts/seed.ts                     → cria o usuário master MATEUS
middleware.ts                       → protege /admin/dashboard
```

---

## 10. Possíveis melhorias futuras

- Menu com lista interativa nativa do WhatsApp (botões/lista) em vez de texto numerado — visualmente melhor, mesma lógica de bastidor.
- Tela de "trocar minha senha" para os administradores.
- Notificação sonora/push no dashboard quando chegar uma dúvida nova.
- Anexar imagens na dúvida ou na resposta.
- Atribuir automaticamente um admin responsável por assunto (hoje é fila geral, por decisão do time).
