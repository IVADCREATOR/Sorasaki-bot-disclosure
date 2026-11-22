import CONFIG from "../../config.js";
import { lerDivulgacao, salvarDivulgacao } from "../../utils/arquivo.js";
import { negritoItalico, largo, exagerar, textoDaVez, textoDoComando, lerRodizio, salvarRodizio, titulo } from "../../utils/sucessos.js";

const ultimos = new Map();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ESTILOS = [
  { nome: "Negrito itálico", fazer: negritoItalico },
  { nome: "Letra larga", fazer: largo },
  { nome: "Exagerado total", fazer: exagerar }
];

async function animar(sock, jid, quadros, quoted) {
  const primeira = await sock.sendMessage(jid, { text: quadros[0] }, { quoted });
  for (const q of quadros.slice(1)) {
    await dormir(700);
    try { await sock.sendMessage(jid, { text: q, edit: primeira.key }); }
    catch { await sock.sendMessage(jid, { text: q }); break; }
  }
}

export default {
  name: "exagerado",
  nome: "cazuza",
  aliases: ["exagerar", "estilo", "estilizar"],
  categoria: "dono",
  description: "Deixa o texto da divulgação exagerado: 3 estilos de letra prontos para usar.",

  async execute({ sock, from, msg, args, isDono }) {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const responder = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const cabecalho = titulo("🤯", "Exagerado", "Cazuza");
    const acao = String(args[0] || "").toLowerCase();

    if (acao === "usar" || acao === "rodizio" || acao === "rodízio") {
      const n = parseInt(args[1], 10);
      const ultimo = ultimos.get(from);
      if (!ultimo) return responder(`Primeiro gere os estilos: ${p}exagerado SEU TEXTO`);
      if (!Number.isInteger(n) || n < 1 || n > ESTILOS.length) return responder(`Escolha o estilo 1, 2 ou 3: ${p}exagerado ${acao} 2`);
      const texto = ESTILOS[n - 1].fazer(ultimo);
      if (acao === "usar") {
        salvarDivulgacao({ mensagens: [texto], mensagem: texto });
        const r = lerRodizio();
        return responder(`Exagerei ✅ O estilo ${n} (${ESTILOS[n - 1].nome}) virou o texto da divulgação.${r.ativo ? `\n⚠️ O rodízio Eternamente está ligado e tem prioridade. Para pôr esse texto nele: ${p}exagerado rodizio ${n}` : ""}`);
      }
      const r = lerRodizio();
      if (r.textos.length >= 10) return responder(`O rodízio já tem 10 textos. Tire um com ${p}eternamente rm NÚMERO.`);
      salvarRodizio({ textos: [...r.textos, texto] });
      return responder(`Exagerei ✅ O estilo ${n} entrou no rodízio como texto ${r.textos.length + 1}.`);
    }

    const base = textoDoComando(msg) || textoDaVez(lerDivulgacao(), { avancar: false }).texto;
    if (!base) return responder(`${cabecalho}\n\nMande o texto depois do comando: ${p}exagerado PROMOÇÃO IMPERDÍVEL\n(ou só ${p}exagerado para estilizar o texto atual da divulgação)`);
    ultimos.set(from, base.slice(0, 3000));
    if (ultimos.size > 50) ultimos.delete(ultimos.keys().next().value);

    const chamada = base.split("\n")[0].slice(0, 30);
    try {
      await animar(sock, from, [
        "🎤 _um, dois, três…_",
        `${chamada}`,
        `*${chamada.toUpperCase()}!*`,
        `🔥 *${negritoItalico(chamada.toUpperCase())}!!!* 🔥`,
        `🚨🤯🚨 *${largo(chamada.toUpperCase())}* 🚨🤯🚨\n_nível ${negritoItalico("CAZUZA")} de exagero_`
      ], msg);
    } catch {}

    const blocos = ESTILOS.map((e, i) => `*${i + 1}. ${e.nome}*\n${e.fazer(base)}`).join("\n\n━━━━━━━━━━\n\n");
    return sock.sendMessage(from, { text: `${cabecalho}\n\n${blocos}\n\n${p}exagerado usar 1 — vira o texto da divulgação\n${p}exagerado rodizio 3 — entra no rodízio Eternamente\n_Links continuam funcionando: o estilo não mexe neles._` });
  }
};
