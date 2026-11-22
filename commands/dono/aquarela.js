import CONFIG from "../../config.js";
import { lerDivulgacao, salvarDivulgacao } from "../../utils/arquivo.js";
import { pintar, textoDaVez, titulo } from "../../utils/sucessos.js";

export default {
  name: "aquarela",
  nome: "toquinho",
  aliases: ["camaleao", "camaleão", "personalizar"],
  categoria: "dono",
  description: "Cada grupo recebe a divulgação pintada com o próprio nome e variações do texto.",

  async execute({ sock, from, msg, args, isDono }) {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const responder = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const acao = String(args[0] || "").toLowerCase();
    const cfg = lerDivulgacao();
    const cabecalho = titulo("🎨", "Aquarela", "Toquinho");

    if (["on", "ligar"].includes(acao)) {
      salvarDivulgacao({ aquarela: true });
      return responder(`${cabecalho}\n\nAquarela ligada 🎨 Cada grupo vai receber o texto pintado do jeito dele.\nVeja como fica: ${p}aquarela teste`);
    }
    if (["off", "desligar"].includes(acao)) {
      salvarDivulgacao({ aquarela: false });
      return responder("Aquarela desligada. Todos os grupos recebem o texto igualzinho.");
    }

    if (acao === "teste") {
      const { texto } = textoDaVez(cfg, { avancar: false });
      if (!texto) return responder(`Antes, defina o texto com ${p}addtexto.`);
      let grupos = [];
      try { grupos = Object.values(await sock.groupFetchAllParticipating()); } catch {}
      const amostra = (grupos.length ? grupos.sort(() => Math.random() - 0.5).slice(0, 3) : [{ subject: "Grupo de exemplo", participants: new Array(120) }])
        .map((g) => ({ nome: g.subject || "Grupo sem nome", membros: Array.isArray(g.participants) ? g.participants.length : 0 }));
      const blocos = amostra.map((g) => `🖌️ *${g.nome}*\n${pintar(texto, g)}`).join("\n\n━━━━━━━━━━\n\n");
      return responder(`${cabecalho}\n\nAssim ${amostra.length > 1 ? `${amostra.length} grupos recebem` : "um grupo recebe"} o mesmo anúncio${cfg.aquarela ? "" : " (com a Aquarela ligada)"}:\n\n${blocos}`);
    }

    return responder(`${cabecalho}

Cada grupo recebe a divulgação pintada com o próprio nome, e o texto muda um pouco de um grupo para outro.

Situação: ${cfg.aquarela ? "ligada 🎨" : "desligada"}

*Use no texto do ${p}addtexto:*
{grupo} — nome do grupo
{membros} — quantas pessoas tem no grupo
{saudacao} — Bom dia / Boa tarde / Boa noite
{hora} · {data} · {dia}
{Oi|Olá|E aí} — o bot escolhe uma opção para cada grupo

Exemplo:
{saudacao}, galera do *{grupo}*! {Olha|Corre|Vem ver} essa oferta 👇

${p}aquarela on | off — liga ou desliga
${p}aquarela teste — mostra como fica em 3 grupos`);
  }
};
