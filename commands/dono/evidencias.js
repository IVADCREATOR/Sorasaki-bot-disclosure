import CONFIG from "../../config.js";
import { lerHistoricoDisparos } from "../../events/autodisparo.js";
import { lerEntrega, quando, titulo } from "../../utils/sucessos.js";

const duracao = (s) => (s >= 90 ? `${Math.round(s / 60)} min` : `${s} s`);
const num = (n) => Number(n || 0).toLocaleString("pt-BR");

function comprovanteTxt(e) {
  const alcance = e.entregues.reduce((s, g) => s + g.membros, 0);
  return [
    "COMPROVANTE DE DIVULGAÇÃO",
    `Gerado em: ${quando(Date.now())}`,
    "",
    `Início do envio: ${quando(e.at)}`,
    `Fim do envio: ${quando(e.fim || e.at)}`,
    `Tipo: ${e.reenvio ? "reenvio para os grupos que faltaram" : e.manual ? "envio manual" : "envio automático"}`,
    `Grupos que receberam: ${e.entregues.length}`,
    `Grupos que não receberam: ${e.falhas.length}`,
    `Alcance (soma dos membros dos grupos que receberam): ${num(alcance)}`,
    `Imagem: ${e.imagem ? "sim" : "não"}`,
    "",
    "TEXTO ENVIADO",
    e.texto,
    "",
    "GRUPOS QUE RECEBERAM",
    ...e.entregues.map((g, i) => `${i + 1}. ${g.nome} (${num(g.membros)} membros)`),
    ...(e.falhas.length ? ["", "GRUPOS QUE NÃO RECEBERAM", ...e.falhas.map((g, i) => `${i + 1}. ${g.nome}: ${g.erro}`)] : [])
  ].join("\n");
}

export default {
  name: "evidencias",
  nome: "evidências",
  aliases: ["chitaozinho", "comprovante", "provas"],
  categoria: "dono",
  description: "Comprovante do último disparo: quais grupos receberam, alcance e horário.",

  async execute({ sock, from, msg, args, isDono }) {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const responder = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const acao = String(args[0] || "").toLowerCase();
    const cabecalho = titulo("🧾", "Evidências", "Chitãozinho & Xororó");

    if (["historico", "histórico"].includes(acao)) {
      const h = lerHistoricoDisparos().slice(-10).reverse();
      if (!h.length) return responder(`${cabecalho}\n\nNenhum disparo registrado ainda.`);
      return responder(`${cabecalho}\n\n*Últimos disparos*\n${h.map((d) => `• ${quando(d.at)} · ${d.sent}/${d.total} grupos${d.failed ? ` · ${d.failed} falha(s)` : ""} · ${d.manual ? "manual" : "automático"} · ${duracao(d.seconds)}`).join("\n")}`);
    }

    const e = lerEntrega();
    if (!e) return responder(`${cabecalho}\n\nAinda não tenho comprovante: ele nasce no próximo disparo. Para enviar agora: ${p}dispararagora`);

    if (["arquivo", "txt", "baixar"].includes(acao)) {
      const nome = `comprovante-divulgacao-${new Date(e.at).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`;
      return sock.sendMessage(from, { document: Buffer.from(comprovanteTxt(e), "utf8"), mimetype: "text/plain", fileName: nome, caption: "🧾 Comprovante completo da última divulgação." }, { quoted: msg });
    }

    const alcance = e.entregues.reduce((s, g) => s + g.membros, 0);
    const top = [...e.entregues].sort((a, b) => b.membros - a.membros).slice(0, 15);
    return responder(`${cabecalho}

As provas da última divulgação, para mostrar a quem pagou pelo anúncio:

🕒 ${quando(e.at)} · levou ${duracao(e.segundos || 0)}
✅ ${e.entregues.length} grupo(s) receberam${e.falhas.length ? ` · ❌ ${e.falhas.length} não receberam` : ""}
👥 Alcance: *${num(alcance)} pessoas*
${e.imagem ? "🖼️ Com imagem" : "📝 Só texto"}${e.rodizio ? ` · texto ${e.rodizio.posicao} de ${e.rodizio.total} do rodízio` : ""}${e.reenvio ? " · reenvio" : ""}

*Maiores grupos que receberam*
${top.map((g, i) => `${i + 1}. ${g.nome} · ${num(g.membros)}`).join("\n") || "_nenhum_"}${e.entregues.length > top.length ? `\n… e mais ${e.entregues.length - top.length}.` : ""}

${p}evidencias arquivo — comprovante completo em .txt
${p}evidencias historico — os últimos 10 disparos${e.falhas.length ? `\n${p}maisumavez — reenviar só para os que faltaram` : ""}`);
  }
};
