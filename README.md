# MAX Serviços — Central de Dúvidas

Plataforma web para funcionários enviarem dúvidas e a equipe administrativa
responder direto pelo WhatsApp corporativo.

- **Formulário público** (`/`): nome completo, telefone e dúvida (textarea adaptável), com saudação automática, animações em cascata e feedback visual verde ao preencher os campos corretamente.
- **Dashboard admin** (`/admin/dashboard`): login protegido, visual de chat (conversa à esquerda, lista de dúvidas à direita), criação de novos administradores pelo usuário master.
- **Envio de respostas via WhatsApp** através da Twilio, para o número que o funcionário informou no formulário.

Stack: **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Framer Motion + Prisma + PostgreSQL (Supabase) + Twilio**. Tudo pronto para deploy na **Vercel**.

---

## 1. Pré-requisitos

- Node.js 18 ou superior instalado na sua máquina (para rodar localmente/testar antes do deploy).
- Uma conta no [Supabase](https://supabase.com) (banco de dados).
- Uma conta na [Twilio](https://www.twilio.com) (envio de WhatsApp) — pode ser configurada depois, o site funciona normalmente sem ela (só o envio real ao WhatsApp fica pendente).
- Uma conta na [Vercel](https://vercel.com) (hospedagem).

---

## 2. Configurando o banco de dados (Supabase)

1. Crie um novo projeto no [Supabase](https://app.supabase.com).
2. Vá em **Project Settings → Database → Connection string**.
3. Copie a string no modo **"Transaction" (porta 6543, com `pgbouncer=true`)** → cole em `DATABASE_URL` no seu `.env`.
4. Copie a string no modo **"Session" (porta 5432)** → cole em `DIRECT_URL` no seu `.env`.
   - `DIRECT_URL` é usada só para rodar as migrations; `DATABASE_URL` é a usada em produção (compatível com o ambiente serverless da Vercel).
5. Substitua `SENHA` pela senha do seu banco (definida na criação do projeto Supabase).

---

## 3. Rodando localmente (recomendado antes de publicar)

```bash
# 1. Instale as dependências
npm install

# 2. Copie o arquivo de variáveis de ambiente e preencha os valores
cp .env.example .env

# 3. Gere as tabelas no banco Supabase a partir do schema Prisma
npx prisma db push

# 4. Crie o usuário master (MATEUS / berrythedev45!)
npm run db:seed

# 5. Rode o projeto
npm run dev
```

Acesse:
- Formulário público: `http://localhost:3000`
- Login do painel: `http://localhost:3000/admin/login` (usuário `MATEUS`, senha `berrythedev45!`)

**Importante:** troque a senha do usuário master assim que possível — ela está em texto puro apenas no `.env` local; no banco ela já é salva com hash (bcrypt), nunca em texto puro.

---

## 4. WhatsApp / Twilio (leia com atenção)

O envio das respostas para o WhatsApp do funcionário é feito pela **Twilio API for WhatsApp**, usando o número **+55 71 8266-8840** como remetente. Isso exige uma configuração que só a MAX Serviços (dona da conta/número) pode fazer — não é algo que se resolve só com código:

1. Crie uma conta Twilio em [twilio.com](https://www.twilio.com).
2. Em **Messaging → Try it out → Send a WhatsApp message**, siga o processo de registro do **WhatsApp Sender** com o número +55 71 8266-8840 (isso passa por aprovação da Meta e pode levar alguns dias).
3. Copie **Account SID** e **Auth Token** (painel principal da Twilio) para `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN` no `.env`.
4. Coloque `TWILIO_WHATSAPP_FROM="whatsapp:+557182668840"`.
5. **Ponto crítico da política do WhatsApp:** como o funcionário nunca manda mensagem pelo WhatsApp antes (ele só preenche o formulário web), toda resposta é uma mensagem **iniciada pela empresa**. A Meta exige que esse tipo de mensagem use um **Message Template pré-aprovado** (ex: "Olá {{1}}, sobre sua dúvida: {{2}}").
   - Crie esse template em **Messaging → Content Template Builder** no painel da Twilio, envie para aprovação da Meta, e coloque o SID gerado (`HXxxxxxxxx...`) em `TWILIO_CONTENT_SID` no `.env`.
   - **Sem isso configurado**, o sistema tenta mandar texto livre, que só funciona se o funcionário tiver mandado mensagem pelo WhatsApp para esse número nas últimas 24 horas — na prática, não funcionará para a maioria dos casos até o template ser aprovado.
6. Enquanto isso não estiver pronto, o sistema **continua funcionando normalmente**: as dúvidas chegam, os admins respondem no dashboard, e a conversa fica registrada — só o envio ao WhatsApp ficará marcado com um aviso (⚠) até a configuração ser concluída. Nenhuma resposta é perdida.

---

## 5. Deploy na Vercel

1. Suba este projeto para um repositório no GitHub (ou GitLab/Bitbucket).
2. Na Vercel, clique em **Add New → Project** e importe o repositório.
3. Em **Environment Variables**, adicione todas as variáveis do seu `.env` (não suba o `.env` para o Git — ele já está no `.gitignore`):
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `JWT_SECRET`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM`
   - `TWILIO_CONTENT_SID` (quando disponível)
   - `NEXT_PUBLIC_APP_URL` (a URL final do projeto na Vercel)
4. Clique em **Deploy**.
5. Depois do primeiro deploy, rode o comando de seed **uma única vez** apontando para o banco de produção (pode ser da sua máquina local, usando o mesmo `DATABASE_URL`/`DIRECT_URL` de produção no `.env`):
   ```bash
   npm run db:seed
   ```
6. Pronto — acesse `https://seu-projeto.vercel.app` (formulário) e `https://seu-projeto.vercel.app/admin/login` (painel).

---

## 6. Segurança

- Senhas de administradores ficam com hash **bcrypt** (nunca em texto puro).
- Sessão de login usa **JWT em cookie httpOnly** (não acessível via JavaScript no navegador), válido por 12h.
- Apenas o usuário **master** (`isMaster: true`) pode criar novos administradores.
- A rota `/admin/dashboard` é protegida por `middleware.ts` — sem sessão válida, redireciona para `/admin/login`.
- Recomenda-se trocar a senha padrão do usuário master (`berrythedev45!`) assim que o projeto estiver no ar — para isso, delete o usuário master no banco e rode `npm run db:seed` novamente com uma senha nova em `MASTER_PASSWORD`, ou crie essa funcionalidade de troca de senha como próxima melhoria.

---

## 7. Estrutura do projeto

```
app/
  page.tsx                     → formulário público
  components/
    PublicForm.tsx             → formulário com animações, saudação e validação
    LoadingSpinner.tsx         → spinners e skeletons de carregamento
  admin/
    login/page.tsx             → tela de login
    dashboard/page.tsx         → valida sessão (server component)
    dashboard/DashboardClient.tsx → UI do chat/dashboard (client component)
  api/
    questions/route.ts         → POST cria dúvida (público) / GET lista (admin)
    questions/[id]/reply/route.ts → responde dúvida + envia WhatsApp
    auth/login/route.ts        → login
    auth/logout/route.ts       → logout
    admin/users/route.ts       → lista/cria administradores (master)
lib/
  prisma.ts                    → client do banco
  auth.ts                      → hash de senha, JWT, sessão
  whatsapp.ts                  → integração Twilio
  greeting.ts                  → saudação por horário do visitante
prisma/schema.prisma           → modelos do banco (AdminUser, Question, Reply)
scripts/seed.ts                → cria o usuário master MATEUS
middleware.ts                  → protege /admin/dashboard
```

---

## 8. Possíveis melhorias futuras

- Tela de "trocar minha senha" para os administradores.
- Notificação sonora/push no dashboard quando chegar uma dúvida nova.
- Anexar imagens na dúvida ou na resposta.
- Histórico de conversas por funcionário (mesmo telefone) reunido em um só lugar.
- WebSocket/Server-Sent Events para atualização em tempo real (hoje é feito por polling a cada 6s, o que já funciona bem para o volume esperado).
