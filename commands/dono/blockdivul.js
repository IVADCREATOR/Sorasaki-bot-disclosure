import path from "path";
import CONFIG from "../../config.js";
import { lerJson, salvarJson } from "../../utils/arquivo.js";

const ARQ = path.resolve("./storage/blacklist_grupos.json");
const POR_PAGINA = 40;

const lerLista = () => { const l = lerJson(ARQ, []); return Array.isArray(l) ? l.map((x) => String(x).trim().toLowerCase()) : []; };
const salvarLista = (l) => salvarJson(ARQ, [...new Set(l)]);

let ultimaLista = { em: 0, grupos: [] };
async function gruposNumerados(sock, renovar = false) {
  if (!renovar && Date.now() - ultimaLista.em < 15 * 60_000 && ultimaLista.grupos.length) return ultimaLista.grupos;
  const todos = Object.values(await sock.groupFetchAllParticipating().catch(() => ({})) || {});
  const grupos = todos.map((g) => ({ id: String(g.id).toLowerCase(), nome: String(g.subject || "Sem nome").replace(/[*_~`]/g, "").slice(0, 40) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  ultimaLista = { em: Date.now(), grupos };
  return grupos;
}

function lerNumeros(args, total) {
  const txt = args.join(" ").toLowerCase();
  if (/\b(todos|tudo|all)\b/.test(txt)) return [...Array(total).keys()];
  const out = new Set();
  for (const parte of txt.split(/[\s,;]+/)) {
    const faixa = /^(\d+)-(\d+)$/.exec(parte);
    if (faixa) { const [a, b] = [Number(faixa[1]), Number(faixa[2])].sort((x, y) => x - y); for (let n = a; n <= b && n - a < 500; n++) out.add(n - 1); continue; }
    if (/^\d+$/.test(parte)) out.add(Number(parte) - 1);
  }
  return [...out].filter((i) => i >= 0 && i < total);
}

export default {
  name: "blockdivul",
  nome: "blockdivul",
  aliases: ["bloqueardivul", "gruposdivul"],
  categoria: "dono",
  description: "Escolhe em quais grupos a divulgação automática NÃO vai.",

  execute: async ({ sock, from, msg, args = [], isDono }) => {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const responder = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const tokPagina = args.find((x) => /^p\d+$/i.test(x));
    const limpos = args.filter((x) => x !== tokPagina);
    const a0 = String(limpos[0] || "").toLowerCase();
    const devolver = ["off", "desbloquear", "voltar", "liberar"].includes(a0);
    const resto = devolver ? limpos.slice(1) : limpos;
    const temNumeros = resto.some((x) => /\d|todos|tudo/i.test(x));

    if (from.endsWith("@g.us") && !temNumeros && !tokPagina) {
      const lista = lerLista();
      const id = from.toLowerCase();
      const bloqueado = lista.includes(id);
      if (devolver) {
        if (!bloqueado) return responder("Este grupo já recebe as divulgações.");
        salvarLista(lista.filter((x) => x !== id));
        return responder("Certo ✅ Este grupo volta a receber as divulgações.");
      }
      if (bloqueado) return responder(`Este grupo já está fora das divulgações. Para devolver: ${p}blockdivul off`);
      salvarLista([...lista, id]);
      return responder(`Certo ✅ Este grupo não recebe mais divulgações automáticas.\n_Dica: no meu privado, *${p}blockdivul* mostra todos os grupos para escolher vários de uma vez._`);
    }

    const grupos = await gruposNumerados(sock, !temNumeros);
    if (!grupos.length) return responder("Não estou em nenhum grupo agora (ou o WhatsApp não respondeu). Tente de novo em instantes.");
    let lista = lerLista();

    if (temNumeros) {
      const idx = lerNumeros(resto, grupos.length);
      if (!idx.length) return responder(`Não entendi os números. Exemplos: *${p}blockdivul 1 3 5* · *${p}blockdivul 2-8* · *${p}blockdivul off 4*`);
      const escolhidos = idx.map((i) => grupos[i]);
      if (devolver) lista = lista.filter((x) => !escolhidos.some((g) => g.id === x));
      else lista = [...lista, ...escolhidos.map((g) => g.id)];
      salvarLista(lista);
      const nomes = escolhidos.slice(0, 20).map((g) => `• ${g.nome}`).join("\n") + (escolhidos.length > 20 ? `\n_… e mais ${escolhidos.length - 20}_` : "");
      return responder(`${devolver ? "🟢 Voltam a receber divulgação" : "🚫 Bloqueados na divulgação"}: *${escolhidos.length}* grupo(s)\n\n${nomes}\n\n_Ver a lista de novo: ${p}blockdivul_`);
    }

    const paginas = Math.ceil(grupos.length / POR_PAGINA);
    const pagina = Math.min(paginas, Math.max(1, Number(String(tokPagina || "p1").slice(1)) || 1));
    const ini = (pagina - 1) * POR_PAGINA;
    const linhas = grupos.slice(ini, ini + POR_PAGINA).map((g, i) => `${lista.includes(g.id) ? "🚫" : "🟢"} *${ini + i + 1}.* ${g.nome}`);
    const bloqueados = grupos.filter((g) => lista.includes(g.id)).length;
    return responder(`📣 *GRUPOS DA DIVULGAÇÃO*\n🟢 recebe · 🚫 bloqueado\n\n${linhas.join("\n")}\n\n` +
      `Total: *${grupos.length}* · bloqueados: *${bloqueados}*${paginas > 1 ? ` · página ${pagina}/${paginas} (${p}blockdivul p${pagina < paginas ? pagina + 1 : 1})` : ""}\n\n` +
      `*Bloquear vários:* ${p}blockdivul 1 3 5  ou  ${p}blockdivul 2-8\n*Desbloquear:* ${p}blockdivul off 3  ·  ${p}blockdivul off todos`);
  }
};
