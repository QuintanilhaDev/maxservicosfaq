import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.MASTER_USERNAME || "MATEUS";
  const password = process.env.MASTER_PASSWORD || "berrythedev45!";

  const existing = await prisma.adminUser.findUnique({ where: { username } });

  if (existing) {
    console.log(`✔ Usuário master "${username}" já existe. Nada a fazer.`);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);

  await prisma.adminUser.create({
    data: {
      username,
      password: hashed,
      isMaster: true,
    },
  });

  console.log(`✔ Usuário master "${username}" criado com sucesso!`);
  console.log(`  Use essas credenciais para o primeiro login no /admin/login`);
}

main()
  .catch((err) => {
    console.error("Erro ao rodar o seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
