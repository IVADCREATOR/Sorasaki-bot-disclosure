import CONFIG from "../../config.js";
import { salvarDivulgacao } from "../../utils/arquivo.js";

export default {
  name: "addtexto",
  nome: "addtexto",
  categoria: "dono",
  description: "Define o texto usado nas divulgações automáticas.",

  execute: async ({ sock, from, msg, isDono }) => {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const original =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      "";
    const texto = original.replace(new RegExp(`^\\${p}addtexto([\\s\\r\\n]*)`, "i"), "").trim();

    if (!texto) {
      return sock.sendMessage(from, {
        text: `Escreva o texto logo depois do comando, assim:\n\n${p}addtexto\n*Minha loja* — promoções todo dia\nhttps://chat.whatsapp.com/...`
      }, { quoted: msg });
    }

    try {
      salvarDivulgacao({ mensagens: [texto], mensagem: texto });
      await sock.sendMessage(from, { text: `Texto salvo ✅ Ele substitui o anterior e vai na próxima divulgação.\nPara conferir como fica: ${p}listext` }, { quoted: msg });
    } catch (e) {
      console.error(`❌ [ADDTEXTO] ${e.message}`);
      await sock.sendMessage(from, { text: "Não consegui salvar o texto agora. Tente de novo em instantes." }, { quoted: msg });
    }
  }
};
