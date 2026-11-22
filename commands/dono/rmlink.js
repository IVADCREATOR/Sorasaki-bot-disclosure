import path from "path";
import CONFIG from "../../config.js";
import { lerJson, salvarJson } from "../../utils/arquivo.js";

const ARQ = path.resolve("./storage/tentativaslinks.json");

export default {
  name: "rmlink",
  nome: "rmlink",
  categoria: "dono",
  description: "Tira um link da fila de auto-entrada.",

  execute: async ({ sock, from, msg, args, isDono }) => {
    if (!isDono) return;
    const link = String(args[0] || "").trim().replace(/\?.*$/, "");
    if (!link) return sock.sendMessage(from, { text: `Envie o link que quer tirar: ${CONFIG.bot.prefix}rmlink https://chat.whatsapp.com/...` }, { quoted: msg });
    const lista = lerJson(ARQ, []);
    const restante = Array.isArray(lista) ? lista.filter((l) => l?.link !== link) : [];
    if (!Array.isArray(lista) || restante.length === lista.length) {
      return sock.sendMessage(from, { text: "Não achei esse link na fila. Veja os cadastrados com " + CONFIG.bot.prefix + "listalinks" }, { quoted: msg });
    }
    try {
      salvarJson(ARQ, restante);
      await sock.sendMessage(from, { text: "Link removido da fila ✅" }, { quoted: msg });
    } catch (e) {
      console.error(`❌ [RMLINK] ${e.message}`);
      await sock.sendMessage(from, { text: "Não consegui remover agora. Tente de novo em instantes." }, { quoted: msg });
    }
  }
};
