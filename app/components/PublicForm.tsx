"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getGreeting } from "@/lib/greeting";
import { LoadingSpinner } from "./LoadingSpinner";

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

function formatPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function PublicForm() {
  const [greeting, setGreeting] = useState("Olá");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [flashName, setFlashName] = useState(false);
  const [flashPhone, setFlashPhone] = useState(false);
  const [flashMessage, setFlashMessage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setGreeting(getGreeting());
    const interval = setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const isNameValid = name.trim().length >= 3;
  const isPhoneValid = phone.replace(/\D/g, "").length >= 10;
  const isMessageValid = message.trim().length >= 5;
  const canSubmit = isNameValid && isPhoneValid && isMessageValid && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setStatus("idle");
    setErrorMsg("");

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, message }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Não foi possível enviar sua dúvida. Tente novamente.");
      }

      setStatus("success");
      setName("");
      setPhone("");
      setMessage("");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Erro inesperado. Tente novamente em instantes.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full max-w-xl mx-auto"
    >
      <motion.div variants={item} className="text-center mb-10">
        <p className="text-jade-300 font-medium tracking-wide mb-2 animate-pulse-soft">
          {greeting}!
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          <span className="text-white">MAX</span>{" "}
          <span className="text-jade-400">Serviços</span>
        </h1>
        <p className="text-gray-400 mt-3 text-sm sm:text-base">
          Preencha os campos abaixo para enviar sua{" "}
          <span className="text-white font-semibold">dúvida</span>. Nossa equipe
          responde direto no seu{" "}
          <span className="text-white font-semibold">WhatsApp</span>.
        </p>
      </motion.div>

      {status === "success" ? (
        <motion.div
          variants={item}
          className="card-panel p-8 text-center animate-fade-up"
        >
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-jade-500/15 flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="#34d399"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Dúvida enviada!</h2>
          <p className="text-gray-400 text-sm">
            Recebemos sua mensagem. Em breve você receberá a resposta pelo
            número de WhatsApp informado.
          </p>
          <button
            onClick={() => setStatus("idle")}
            className="btn-primary mt-6"
            type="button"
          >
            Enviar outra dúvida
          </button>
        </motion.div>
      ) : (
        <motion.form
          variants={item}
          onSubmit={handleSubmit}
          className="card-panel p-6 sm:p-8 space-y-5"
        >
          <motion.div variants={item}>
            <label className="block text-sm text-gray-400 mb-1.5">
              Diga seu nome completo
            </label>
            <input
              className={`field-input ${flashName ? "field-valid" : ""}`}
              type="text"
              value={name}
              placeholder="Ex: João da Silva"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (isNameValid) {
                  setFlashName(true);
                  setTimeout(() => setFlashName(false), 600);
                }
              }}
              required
              minLength={3}
            />
          </motion.div>

          <motion.div variants={item}>
            <label className="block text-sm text-gray-400 mb-1.5">
              Seu número de telefone
            </label>
            <input
              className={`field-input ${flashPhone ? "field-valid" : ""}`}
              type="tel"
              inputMode="numeric"
              value={phone}
              placeholder="(71) 99999-9999"
              onChange={(e) => setPhone(formatPhoneMask(e.target.value))}
              onBlur={() => {
                if (isPhoneValid) {
                  setFlashPhone(true);
                  setTimeout(() => setFlashPhone(false), 600);
                }
              }}
              required
            />
          </motion.div>

          <motion.div variants={item}>
            <label className="block text-sm text-gray-400 mb-1.5">
              Diga sua dúvida
            </label>
            <textarea
              className={`field-input resize-y min-h-[120px] max-h-[400px] ${
                flashMessage ? "field-valid" : ""
              }`}
              value={message}
              placeholder="Escreva aqui sua dúvida com o máximo de detalhes possível..."
              onChange={(e) => setMessage(e.target.value)}
              onBlur={() => {
                if (isMessageValid) {
                  setFlashMessage(true);
                  setTimeout(() => setFlashMessage(false), 600);
                }
              }}
              required
              minLength={5}
            />
          </motion.div>

          {status === "error" && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2"
            >
              {errorMsg}
            </motion.p>
          )}

          <motion.button
            variants={item}
            type="submit"
            disabled={!canSubmit}
            className="btn-primary w-full"
          >
            {submitting ? (
              <>
                <LoadingSpinner size={18} />
                Enviando...
              </>
            ) : (
              "Enviar dúvida"
            )}
          </motion.button>
        </motion.form>
      )}

      <motion.p
        variants={item}
        className="text-center text-xs text-gray-600 mt-8"
      >
        © {new Date().getFullYear()} MAX Serviços — Central de Dúvidas
      </motion.p>
    </motion.div>
  );
}
