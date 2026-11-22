import path from "path";
import { downloadContentFromMessage } from "baileys";
import logger from "../../utils/logger.js";
import { salvarArquivo, salvarDivulgacao } from "../../utils/arquivo.js";

const IMAGEM = path.resolve("./storage/midia/divulgacao.jpg");

export default {
  name: "addfoto",
  nome: "addfoto",
  categoria: "dono",
  description: "Vincula uma imagem à divulgação automática.",

  async execute({ sock, from, msg, isDono }) {
    if (!isDono) return;
    const citada = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imagem = msg.message?.imageMessage || citada?.imageMessage;
    if (!imagem) {
      return sock.sendMessage(from, { text: "Envie uma imagem com *addfoto* na legenda (ou responda uma imagem com o comando)." }, { quoted: msg });
    }
    try {
      const partes = [];
      for await (const pedaco of await downloadContentFromMessage(imagem, "image")) partes.push(pedaco);
      salvarArquivo(IMAGEM, Buffer.concat(partes));
      salvarDivulgacao({ imagemDivulgacao: IMAGEM });
      logger.success("🖼️ [ADDFOTO] Imagem vinculada à divulgação automática.");
      await sock.sendMessage(from, { text: "Imagem salva ✅ Ela vai junto na próxima divulgação." }, { quoted: msg });
    } catch (err) {
      logger.error(`❌ [ADDFOTO] Erro ao salvar imagem: ${err.message}`);
      await sock.sendMessage(from, { text: "Não consegui baixar essa imagem. Tente enviar de novo." }, { quoted: msg });
    }
  }
};
