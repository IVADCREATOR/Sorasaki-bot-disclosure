import path from "path";
import CONFIG from "../../config.js";
import { lerJson } from "../../utils/arquivo.js";

const ARQ = path.resolve("./storage/tentativaslinks.json");

export default {
  name: "listalinks",
  nome: "listalinks",
  categoria: "dono",
  description: "Lista os links da fila de auto-entrada.",

  execute: async ({ sock, from, msg, isDono }) => {
    if (!isDono) return;
    const lista = lerJson(ARQ, []);
    if (!Array.isArray(lista) || !lista.length) {
      return sock.sendMessage(from, { text: `A fila de grupos está vazia. Adicione com ${CONFIG.bot.prefix}registrarlink <link>` }, { quoted: msg });
    }
    const linhas = lista.slice(0, 40).map((l, i) =>
      `${i + 1}. ${l.nomeGrupo || "Sem nome"} — ${l.processadoOfc ? "já está no grupo" : "aguardando entrar"}\n${l.link}\n${l.totalEnvios || 0} envio(s) · ${l.ciclosConcluidos || 0} ciclo(s)`);
    const resto = lista.length > 40 ? `\n\n… e mais ${lista.length - 40}.` : "";
    await sock.sendMessage(from, { text: `*Fila de grupos* (${lista.length})\n\n${linhas.join("\n\n")}${resto}` }, { quoted: msg });
  }
};
