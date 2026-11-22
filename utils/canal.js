import { generateWAMessageFromContent, prepareWAMessageMedia, proto } from "baileys";
import logger from "./logger.js";

export const CANAL = {
  texto: "Sorasaki canal",
  link: "https://whatsapp.com/channel/0029VbDgYzOL2AU7jRJrN304"
};

let falhasSeguidas = 0;
let desligadoAte = 0;

function nosExtras(jid) {
  const nos = [{ tag: "biz", attrs: {}, content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] }] }];
  if (!String(jid).endsWith("@g.us")) nos.push({ tag: "bot", attrs: { biz_bot: "1" } });
  return nos;
}

export async function enviarComCanal(sock, jid, { texto, imagem = null }) {
  if (Date.now() > desligadoAte) {
    try {
      const midia = imagem ? await prepareWAMessageMedia({ image: imagem }, { upload: sock.waUploadToServer }) : null;
      const interactiveMessage = proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: texto }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: "" }),
        header: proto.Message.InteractiveMessage.Header.create(midia?.imageMessage ? { hasMediaAttachment: true, imageMessage: midia.imageMessage } : { title: "", subtitle: "", hasMediaAttachment: false }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: [{ name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: CANAL.texto, url: CANAL.link, merchant_url: CANAL.link }) }],
          messageParamsJson: ""
        })
      });
      const m = generateWAMessageFromContent(jid, {
        viewOnceMessage: { message: { messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, interactiveMessage } }
      }, { userJid: sock.user?.id });
      await sock.relayMessage(jid, m.message, { messageId: m.key.id, additionalNodes: nosExtras(jid) });
      falhasSeguidas = 0;
      return m;
    } catch (e) {
      falhasSeguidas++;
      logger.warn(`⚠️ Botão do canal não foi (${String(e?.message || e).slice(0, 80)}); mandando a divulgação no formato normal.`);
      if (falhasSeguidas >= 3) { desligadoAte = Date.now() + 30 * 60_000; falhasSeguidas = 0; }
    }
  }
  const comLink = `${texto}\n\n📢 *${CANAL.texto}:* ${CANAL.link}`;
  return imagem ? sock.sendMessage(jid, { image: imagem, caption: comLink }) : sock.sendMessage(jid, { text: comLink });
}
