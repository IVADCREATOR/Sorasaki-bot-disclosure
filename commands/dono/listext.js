import CONFIG from "../../config.js";
import { lerDivulgacao } from "../../utils/arquivo.js";
import { textoDaVez, pintar } from "../../utils/sucessos.js";

export default {
  name: "listext",
  nome: "listext",
  categoria: "dono",
  description: "Mostra a prévia da divulgação atual.",

  execute: async ({ sock, from, msg, isDono }) => {
    if (!isDono) return;
    const config = lerDivulgacao();
    const vez = textoDaVez(config, { avancar: false });
    if (!vez.texto) {
      return sock.sendMessage(from, { text: `Ainda não há texto de divulgação. Defina com ${CONFIG.bot.prefix}addtexto.` }, { quoted: msg });
    }
    const texto = config.aquarela === true ? pintar(vez.texto, { nome: "Grupo de exemplo", membros: 120 }) : vez.texto;
    const extras = [config.imagemDivulgacao ? "junto com a imagem salva" : "", vez.posicao ? `texto ${vez.posicao} de ${vez.total} do rodízio Eternamente` : "", config.aquarela === true ? "pintado pela Aquarela num grupo de exemplo" : ""].filter(Boolean);
    await sock.sendMessage(from, {
      text: `É assim que a próxima divulgação vai sair${extras.length ? ` (${extras.join("; ")})` : ""}:\n\n${texto}\n\n🔘 _(embaixo vai o botão *Sorasaki canal*)_`
    }, { quoted: msg });
  }
};
