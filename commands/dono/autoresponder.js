import CONFIG from "../../config.js";
import { lerDivulgacao, salvarDivulgacao } from "../../utils/arquivo.js";
import { reagendarCicloExterno } from "../../events/autodisparo.js";

export default {
  name: "autoresponder",
  nome: "autoresponder",
  categoria: "dono",
  description: "Liga ou desliga a divulgação automática.",

  execute: async ({ sock, from, msg, args, isDono }) => {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const acao = String(args[0] || "").toLowerCase();
    const config = lerDivulgacao();
    const intervalo = config.intervaloMinutos || 60;

    if (acao === "on" || acao === "off") {
      const ligar = acao === "on";
      if ((config.status === true) === ligar) {
        return sock.sendMessage(from, { text: `A divulgação automática já está ${ligar ? "ligada" : "desligada"}.` }, { quoted: msg });
      }
      salvarDivulgacao({ status: ligar });
      reagendarCicloExterno(sock);
      const semTexto = ligar && !((config.mensagens || [])[0] || config.mensagem);
      return sock.sendMessage(from, {
        text: ligar
          ? `Divulgação automática ligada ✅ Envio a cada ${intervalo} min.${semTexto ? `\n\nFalta definir o texto: ${p}addtexto` : ""}`
          : "Divulgação automática desligada. Nada mais é enviado até você ligar de novo."
      }, { quoted: msg });
    }

    return sock.sendMessage(from, {
      text: `Divulgação automática: ${config.status ? "ligada ✅" : "desligada"}\nIntervalo: ${intervalo} min\n\nPara mudar: ${p}autoresponder on  ou  ${p}autoresponder off`
    }, { quoted: msg });
  }
};
