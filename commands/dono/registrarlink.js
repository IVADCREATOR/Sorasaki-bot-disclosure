import path from "path";
import CONFIG from "../../config.js";
import { lerJson, salvarJson } from "../../utils/arquivo.js";

const ARQ = path.resolve("./storage/tentativaslinks.json");
const LINK = /^https:\/\/chat\.whatsapp\.com\/[a-zA-Z0-9]{10,30}$/;

export default {
  name: "registrarlink",
  nome: "registrarlink",
  categoria: "dono",
  description: "Coloca um link de grupo na fila de auto-entrada.",

  execute: async ({ sock, from, msg, args, isDono }) => {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const link = String(args[0] || "").trim().replace(/\?.*$/, "");
    if (!link) {
      return sock.sendMessage(from, { text: `Envie o link do grupo, e um nome se quiser:\n${p}registrarlink https://chat.whatsapp.com/... Grupo de vendas` }, { quoted: msg });
    }
    if (!LINK.test(link)) {
      return sock.sendMessage(from, { text: "Esse link não parece um convite de grupo do WhatsApp. Ele começa com https://chat.whatsapp.com/" }, { quoted: msg });
    }
    let lista = lerJson(ARQ, []);
    if (!Array.isArray(lista)) lista = [];
    if (lista.some((l) => l?.link === link)) {
      return sock.sendMessage(from, { text: "Esse link já está na fila." }, { quoted: msg });
    }
    const nomeGrupo = args.slice(1).join(" ").trim().slice(0, 80) || null;
    try {
      lista.push({ link, nomeGrupo, registradoEm: Date.now(), processadoOfc: false, totalEnvios: 0, ciclosConcluidos: 0 });
      salvarJson(ARQ, lista);
      await sock.sendMessage(from, { text: `Link na fila ✅${nomeGrupo ? ` (${nomeGrupo})` : ""}\nO bot tenta entrar no grupo em até 1 minuto.` }, { quoted: msg });
    } catch (e) {
      console.error(`❌ [REGISTRARLINK] ${e.message}`);
      await sock.sendMessage(from, { text: "Não consegui salvar o link agora. Tente de novo em instantes." }, { quoted: msg });
    }
  }
};
