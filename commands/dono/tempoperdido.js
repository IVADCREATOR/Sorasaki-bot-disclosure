import path from "path";
import CONFIG from "../../config.js";
import { lerJson, salvarJson } from "../../utils/arquivo.js";
import { ultimaMensagem, termometroDesde, falhasSeguidas, quando, titulo } from "../../utils/sucessos.js";

const ARQ_BLACKLIST = path.resolve("./storage/blacklist_grupos.json");
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: "tempoperdido",
  nome: "legiao",
  aliases: ["legião", "gruposmortos", "faxina"],
  categoria: "dono",
  description: "Acha os grupos onde divulgar é tempo perdido: parados há dias ou que sempre falham.",

  async execute({ sock, from, msg, args, isDono }) {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const responder = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const acao = String(args[0] || "").toLowerCase();
    const numero = args.map((a) => parseInt(a, 10)).find((n) => Number.isInteger(n) && n > 0);
    const dias = Math.min(90, numero || 7);
    const cabecalho = titulo("⌛", "Tempo Perdido", "Legião Urbana");

    let grupos = [];
    try { grupos = Object.values(await sock.groupFetchAllParticipating()); }
    catch { return responder("Não consegui listar os grupos agora. Tente de novo em instantes."); }

    const lista = lerJson(ARQ_BLACKLIST, []);
    const bloqueados = new Set((Array.isArray(lista) ? lista : []).map((id) => String(id).toLowerCase()));
    const corte = Date.now() - dias * 86_400_000;
    const medindoHaTempo = termometroDesde() <= corte;
    const falhas = falhasSeguidas();
    const perdidos = grupos.filter((g) => !bloqueados.has(g.id.toLowerCase())).map((g) => {
      const ultima = ultimaMensagem(g.id);
      const parado = ultima ? ultima < corte : medindoHaTempo;
      const falhou = (Number(falhas[g.id]) || 0) >= 3;
      return parado || falhou ? { id: g.id, nome: g.subject || "Grupo sem nome", ultima, falhou } : null;
    }).filter(Boolean);

    if (!perdidos.length) {
      return responder(`${cabecalho}\n\nNenhum grupo perdido ✅ Todos conversaram nos últimos ${dias} dia(s) e receberam os últimos disparos.${medindoHaTempo ? "" : `\n\n_O termômetro mede desde ${quando(termometroDesde())}; grupos que nunca falaram só entram na lista depois de ${dias} dia(s) medindo._`}`);
    }

    if (["bloquear", "block", "tirar"].includes(acao)) {
      salvarJson(ARQ_BLACKLIST, [...(Array.isArray(lista) ? lista : []), ...perdidos.map((g) => g.id)]);
      return responder(`Pronto ✅ ${perdidos.length} grupo(s) saíram da divulgação.\nPara devolver: ${p}blockdivul (lista) e ${p}blockdivul off NÚMERO, ou ${p}blockdivul off dentro dele.`);
    }

    if (acao === "sair") {
      if (!args.map((a) => a.toLowerCase()).includes("confirmar")) {
        return responder(`⚠️ O bot vai *sair* de ${perdidos.length} grupo(s). Para confirmar: ${p}tempoperdido sair confirmar${numero ? ` ${dias}` : ""}`);
      }
      await responder(`Saindo de ${perdidos.length} grupo(s)… ⌛`);
      let saiu = 0;
      for (const g of perdidos) {
        try { await sock.groupLeave(g.id); saiu++; } catch {}
        await dormir(2500);
      }
      return responder(`Pronto ✅ Saí de ${saiu} de ${perdidos.length} grupo(s).`);
    }

    const linhas = perdidos.slice(0, 30).map((g, i) => `${i + 1}. ${g.nome}\n   ${g.falhou ? "❌ falhou nos últimos disparos" : g.ultima ? `💤 parado desde ${quando(g.ultima)}` : `💤 ninguém falou desde ${quando(termometroDesde())}`}`);
    return responder(`${cabecalho}

Divulgar nesses grupos é tempo perdido (parados há mais de ${dias} dia(s) ou falhando sempre):

${linhas.join("\n")}${perdidos.length > 30 ? `\n… e mais ${perdidos.length - 30}.` : ""}

${p}tempoperdido bloquear — tira todos da divulgação
${p}tempoperdido sair — o bot sai desses grupos
${p}tempoperdido 15 — muda para 15 dias`);
  }
};
