import CONFIG from "../../config.js";
import { lerDivulgacao } from "../../utils/arquivo.js";
import { textoDaVez } from "../../utils/sucessos.js";
import { forcarDisparoExterno, disparoEmAndamento } from "../../events/autodisparo.js";

export default {
  name: "dispararagora",
  nome: "dispararagora",
  categoria: "dono",
  description: "Envia a divulgação agora, sem esperar o intervalo.",

  execute: async ({ sock, from, msg, isDono }) => {
    if (!isDono) return;
    const config = lerDivulgacao();
    if (!textoDaVez(config, { avancar: false }).texto) {
      return sock.sendMessage(from, { text: `Antes, defina o texto da divulgação com ${CONFIG.bot.prefix}addtexto.` }, { quoted: msg });
    }
    if (disparoEmAndamento()) {
      return sock.sendMessage(from, { text: "Já tem uma divulgação saindo agora. O relatório chega aqui quando terminar." }, { quoted: msg });
    }
    await sock.sendMessage(from, { text: "Enviando agora 📣 Com muitos grupos leva alguns minutos; o relatório chega aqui no final." }, { quoted: msg });
    try {
      const r = await forcarDisparoExterno(sock);
      if (r && !r.ok) await sock.sendMessage(from, { text: `Não deu para enviar: ${r.texto}.` }, { quoted: msg });
    } catch (e) {
      console.error(`❌ [DISPARARAGORA] ${e.message}`);
      await sock.sendMessage(from, { text: `Algo deu errado durante o envio. Veja o terminal do bot para detalhes.` }, { quoted: msg });
    }
  }
};
