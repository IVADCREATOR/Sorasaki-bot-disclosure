import fs from "fs";
import path from "path";

const RUNTIME = () => path.resolve(process.env.SORASAKI_RUNTIME_DIR || "./runtime");
const LIMITE_POR_MINUTO = 60;
const TAM_TEXTO = 90;

let vivo = { ate: 0, conferidoEm: 0 };
export function aoVivo(agora = Date.now()) {
  if (process.env.SORASAKI_PAINEL !== "on") return true;
  if (agora - vivo.conferidoEm > 3000) {
    vivo.conferidoEm = agora;
    try { vivo.ate = Number(JSON.parse(fs.readFileSync(path.join(RUNTIME(), "ao-vivo.json"), "utf8")).ate) || 0; } catch { vivo.ate = 0; }
  }
  return vivo.ate > agora;
}

let nomes = { mapa: new Map(), lidoEm: 0 };
function nomeDoGrupo(jid) {
  if (Date.now() - nomes.lidoEm > 60_000) {
    nomes.lidoEm = Date.now();
    try { nomes.mapa = new Map((JSON.parse(fs.readFileSync(path.join(RUNTIME(), "groups.json"), "utf8")).groups || []).map((g) => [g.jid, g.name])); } catch {}
  }
  const n = nomes.mapa.get(jid);
  return n ? String(n).replace(/\s+/g, " ").slice(0, 40) : `grupo …${String(jid).split("@")[0].slice(-4)}`;
}

const mascarar = (jid) => { const d = String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, ""); return d ? `•••${d.slice(-4)}` : "?"; };
const corta = (t) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > TAM_TEXTO ? `${s.slice(0, TAM_TEXTO)}…` : s; };

const TIPOS = {
  imageMessage: "imagem", videoMessage: "vídeo", audioMessage: "áudio", stickerMessage: "figurinha", documentMessage: "documento",
  documentWithCaptionMessage: "documento", contactMessage: "contato", contactsArrayMessage: "contatos", locationMessage: "localização",
  liveLocationMessage: "localização ao vivo", pollCreationMessage: "enquete", pollCreationMessageV2: "enquete", pollCreationMessageV3: "enquete",
  pollUpdateMessage: "voto na enquete", viewOnceMessage: "visualização única", viewOnceMessageV2: "visualização única", eventMessage: "evento",
  buttonsResponseMessage: "botão", listResponseMessage: "lista", interactiveResponseMessage: "botão", templateButtonReplyMessage: "botão"
};
const IGNORAR = new Set(["protocolMessage", "senderKeyDistributionMessage", "messageContextInfo"]);
export function descrever(m) {
  if (!m || typeof m !== "object") return null;
  if (m.conversation) return corta(m.conversation);
  if (m.extendedTextMessage?.text) return corta(m.extendedTextMessage.text);
  if (m.reactionMessage) return m.reactionMessage.text ? `[reagiu ${m.reactionMessage.text}]` : "[tirou a reação]";
  if (m.ephemeralMessage?.message) return descrever(m.ephemeralMessage.message);
  for (const [k, v] of Object.entries(m)) {
    if (IGNORAR.has(k) || !v) continue;
    const tipo = TIPOS[k];
    if (!tipo) continue;
    const legenda = v.caption || v.message?.documentMessage?.caption || v.selectedDisplayText || v.name || "";
    return `[${tipo}]${legenda ? ` ${corta(legenda)}` : ""}`;
  }
  const outro = Object.keys(m).find((k) => !IGNORAR.has(k));
  return outro ? `[${outro.replace(/Message$/, "")}]` : null;
}

let janela = { minuto: 0, n: 0, puladas: 0 };
function escrever(linha) {
  const minuto = Math.floor(Date.now() / 60_000);
  if (janela.minuto !== minuto) {
    if (janela.puladas) console.log(`📊 [WHATSAPP] +${janela.puladas} mensagem(ns) no último minuto não mostradas (limite de ${LIMITE_POR_MINUTO} por minuto).`);
    janela = { minuto, n: 0, puladas: 0 };
  }
  if (++janela.n > LIMITE_POR_MINUTO) { janela.puladas++; return; }
  console.log(linha);
}

const enviadasPeloBot = new Set();
export function anotarEnvio(id) {
  if (!id) return;
  enviadasPeloBot.add(id);
  if (enviadasPeloBot.size > 500) enviadasPeloBot.delete(enviadasPeloBot.values().next().value);
}

const onde = (jid) => (String(jid).endsWith("@g.us") ? `[GRUPO: ${nomeDoGrupo(jid)}]` : `[PRIVADO ${mascarar(jid)}]`);

export function registrarRecebida(msg, { comando = false } = {}) {
  try {
    if (!msg?.key?.remoteJid || !msg.message || msg.key.remoteJid === "status@broadcast" || !aoVivo()) return;
    const jid = msg.key.remoteJid;
    const desc = descrever(msg.message);
    if (!desc) return;
    if (msg.key.fromMe) {
      if (enviadasPeloBot.has(msg.key.id)) return;
      return escrever(`📤 ${onde(jid)} (pelo celular do bot): ${desc}`);
    }
    const autor = String(jid).endsWith("@g.us") ? (msg.key.participant || msg.participant) : jid;
    const nome = String(msg.pushName || "").replace(/\s+/g, " ").trim().slice(0, 25);
    escrever(`📩 ${onde(jid)} ${nome ? `${nome} ` : ""}(${mascarar(autor)})${comando ? " ⚡comando" : ""}: ${desc}`);
  } catch {}
}

export function registrarEnviada(jid, content, enviada) {
  try {
    anotarEnvio(enviada?.key?.id);
    if (!jid || content?.react || content?.delete || !aoVivo()) return;
    const desc = content?.text != null ? corta(content.text) : content?.image ? `[imagem]${content.caption ? ` ${corta(content.caption)}` : ""}`
      : content?.video ? "[vídeo]" : content?.audio ? "[áudio]" : content?.sticker ? "[figurinha]" : content?.document ? "[documento]" : content?.poll ? "[enquete]" : "[mensagem]";
    escrever(`📤 ${onde(jid)}: ${desc}`);
  } catch {}
}

export const _teste = { reiniciar: () => { janela = { minuto: 0, n: 0, puladas: 0 }; vivo = { ate: 0, conferidoEm: 0 }; nomes = { mapa: new Map(), lidoEm: 0 }; } };
