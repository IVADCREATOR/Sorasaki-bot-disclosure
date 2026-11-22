import CONFIG from "../../config.js";
import { lerRodizio, salvarRodizio, textoDoComando, titulo } from "../../utils/sucessos.js";

const MAX_TEXTOS = 10;
const previa = (t) => `${t.replace(/\s+/g, " ").slice(0, 70)}${t.length > 70 ? "…" : ""}`;

export default {
  name: "eternamente",
  nome: "galgosta",
  aliases: ["degalgosta", "rodizio", "rodízio"],
  categoria: "dono",
  description: "Rodízio eterno de textos: cada disparo leva o próximo texto da fila.",

  async execute({ sock, from, msg, args, isDono }) {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const responder = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const acao = String(args[0] || "").toLowerCase();
    const r = lerRodizio();
    const cabecalho = titulo("💜", "Eternamente", "de Gal Gosta");

    if (["add", "adicionar", "+"].includes(acao)) {
      const texto = textoDoComando(msg, true);
      if (!texto) return responder(`Escreva o texto depois do comando:\n\n${p}eternamente add\n*Promoção de hoje* ...`);
      if (r.textos.length >= MAX_TEXTOS) return responder(`O rodízio já tem ${MAX_TEXTOS} textos. Tire um com ${p}eternamente rm NÚMERO.`);
      const textos = [...r.textos, texto];
      salvarRodizio({ textos });
      return responder(`💜 Texto ${textos.length} guardado no rodízio.${!r.ativo && textos.length >= 2 ? `\nPara ligar: ${p}eternamente on` : !r.ativo ? "\nGuarde mais um texto para ligar o rodízio." : ""}`);
    }

    if (["rm", "remover", "tirar", "apagar"].includes(acao)) {
      const n = parseInt(args[1], 10);
      if (!Number.isInteger(n) || n < 1 || n > r.textos.length) return responder(`Diga o número do texto (veja com ${p}eternamente lista).`);
      const textos = r.textos.filter((_, i) => i !== n - 1);
      salvarRodizio({ textos, indice: 0, ativo: r.ativo && textos.length >= 2 });
      return responder(`Texto ${n} saiu do rodízio ✅${r.ativo && textos.length < 2 ? "\nCom menos de 2 textos o rodízio desligou e volta o texto normal." : ""}`);
    }

    if (["on", "ligar"].includes(acao)) {
      if (r.textos.length < 2) return responder(`Guarde pelo menos 2 textos antes: ${p}eternamente add SEU TEXTO`);
      salvarRodizio({ ativo: true });
      return responder(`${cabecalho}\n\nRodízio ligado 💜 Os ${r.textos.length} textos vão se revezar para sempre, um por disparo.`);
    }

    if (["off", "desligar"].includes(acao)) {
      salvarRodizio({ ativo: false });
      return responder(`Rodízio desligado. A divulgação volta a usar o texto do ${p}addtexto.`);
    }

    if (acao === "limpar") {
      salvarRodizio({ ativo: false, textos: [], indice: 0 });
      return responder("Rodízio apagado ✅");
    }

    const vez = r.textos.length ? r.indice % r.textos.length : -1;
    const lista = r.textos.length
      ? r.textos.map((t, i) => `${i === vez && r.ativo ? "▶️" : `${i + 1}.`} ${previa(t)}`).join("\n")
      : "_Nenhum texto guardado ainda._";
    return responder(`${cabecalho}

Seus textos se revezam para sempre: cada disparo leva o próximo da fila, e o grupo não vê o mesmo anúncio duas vezes seguidas.

Situação: ${r.ativo ? "ligado 💜" : "desligado"} · ${r.textos.length}/${MAX_TEXTOS} textos
${lista}

${p}eternamente add TEXTO — guarda um texto
${p}eternamente rm 2 — tira o texto 2
${p}eternamente on | off — liga ou desliga
${p}eternamente limpar — apaga todos`);
  }
};
