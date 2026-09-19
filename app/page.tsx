import { redirect } from "next/navigation";

// Não existe mais formulário público: colaboradores enviam dúvidas
// diretamente pelo WhatsApp (o bot fica em app/api/whatsapp/webhook).
// A raiz do site é usada apenas pela equipe administrativa.
export default function HomePage() {
  redirect("/admin/login");
}
