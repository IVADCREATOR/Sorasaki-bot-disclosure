
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { normalizeMessageContent } from "baileys";
import CONFIG from "../config.js";
import logger from "../utils/logger.js";
import { interceptarDivulgacao } from "./autodisparo.js";
import * as metrics from "../metrics/collector.js";
import { responderAutomatico, registrarMensagemDono } from "./respostas.js";
import { salvarJson } from "../utils/arquivo.js";
import { registrarRecebida } from "../utils/console-wa.js";
import { registrarCalor } from "../utils/sucessos.js";

const comoVincular = () => "confira o número do dono no config.js e reinicie o bot";

const usuarioDoJid = (jid) => String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");

function variantes(numero) {
  const n = String(numero || "").replace(/\D/g, "");
  if (!n) return [];
  const lista = [n];
  if (n.startsWith("55") && n.length === 13 && n[4] === "9") lista.push(n.slice(0, 4) + n.slice(5));
  if (n.startsWith("55") && n.length === 12) lista.push(n.slice(0, 4) + "9" + n.slice(4));
  return lista;
}

const ARQ_DONOS = path.resolve("./storage/donos.json");
const IDS_DONO = new Set([...variantes(CONFIG.owner?.number), ...variantes(usuarioDoJid(CONFIG.owner?.lid))]);
const IDS_CONFIG = IDS_DONO.size;
try { for (const id of JSON.parse(fs.readFileSync(ARQ_DONOS, "utf8"))) if (/^\d{6,20}$/.test(String(id))) IDS_DONO.add(String(id)); } catch {}

function salvarDonos() {
  try {
    const base = new Set([...variantes(CONFIG.owner?.number), ...variantes(usuarioDoJid(CONFIG.owner?.lid))]);
    const aprendidos = [...IDS_DONO].filter((id) => !base.has(id)).slice(-20);
    salvarJson(ARQ_DONOS, aprendidos, { compacto: true });
  } catch (e) { logger.warn(`⚠️ [DONO] Não consegui salvar o dono aprendido: ${e.message}`); }
}
function candidatosDono(msg, from, isGroup) {
  const k = msg.key;
  return (isGroup
    ? [k.participant, k.participantPn, k.participantAlt, k.participantLid, msg.participant]
    : [from, k.remoteJid, k.senderPn, k.senderLid, k.remoteJidAlt]
  ).map(usuarioDoJid).filter(Boolean);
}
export async function aprenderLidDono(sock) {
  const proprios = [...new Set([sock?.user?.id, sock?.user?.lid, sock?.authState?.creds?.me?.id, sock?.authState?.creds?.me?.lid].map(usuarioDoJid).filter(Boolean))];
  const novosProprios = proprios.filter((id) => !IDS_DONO.has(id));
  if (novosProprios.length) {
    novosProprios.forEach((id) => IDS_DONO.add(id));
    salvarDonos();
    logger.info(`🔑 [DONO] O próprio número do bot também é dono (${novosProprios.map(mascarar).join(", ")}).`);
  }
  const numeros = variantes(CONFIG.owner?.number);
  if (!numeros.length || typeof sock?.onWhatsApp !== "function") return;
  try {
    const res = await sock.onWhatsApp(...numeros.map((n) => `${n}@s.whatsapp.net`));
    const novos = [];
    for (const r of res || []) {
      for (const id of [usuarioDoJid(r?.jid), usuarioDoJid(r?.lid)]) {
        if (id && !IDS_DONO.has(id)) { IDS_DONO.add(id); novos.push(id); }
      }
    }
    if (novos.length) { salvarDonos(); logger.info(`🔑 [DONO] Dono reconhecido também pelo ID oculto do WhatsApp (${novos.map(mascarar).join(", ")}).`); }
    else if (!(res || []).length) logger.warn(`⚠️ [DONO] O WhatsApp não achou o número do dono (${mascarar(numeros[0])}). Confira o número no config.js.`);
  } catch (e) { logger.warn(`⚠️ [DONO] Não consegui buscar o ID oculto do dono agora (${e.message}). Mande uma mensagem do bot para você mesmo, ou tente de novo após reiniciar.`); }
}

const avisosNaoDono = new Map();
const mascarar = (id) => (id ? `•••${String(id).slice(-4)}` : "?");

if (!IDS_CONFIG) logger.warn(`⚠️ [DONO] Nenhum número de dono configurado: só mensagens enviadas pelo próprio número do bot contam como dono. Para vincular o seu WhatsApp, ${comoVincular()}.`);

function ehDono(msg, from, isGroup) {
  if (msg.key.fromMe) return true;
  const ids = candidatosDono(msg, from, isGroup);
  if (!ids.some((u) => IDS_DONO.has(u))) return false;
  const novos = ids.filter((u) => !IDS_DONO.has(u));
  if (novos.length) {
    novos.forEach((u) => IDS_DONO.add(u));
    salvarDonos();
    logger.info(`🔑 [DONO] Identificador do dono aprendido (${novos.map(mascarar).join(", ")}); os comandos continuam funcionando mesmo quando o WhatsApp esconder o número.`);
  }
  return true;
}

async function vincularDono({ sock, msg, from, isGroup, codigo }) {
  const arq = path.resolve(process.env.SORASAKI_RUNTIME_DIR || "./runtime", "dono-codigo.json");
  let pedido = null;
  try { pedido = JSON.parse(fs.readFileSync(arq, "utf8")); } catch {}
  const valido = pedido && pedido.expira > Date.now() && crypto.createHash("sha256").update(String(codigo)).digest("hex") === pedido.hash;
  if (isGroup || !valido) {
    logger.warn(`🔒 [DONO] Tentativa de vincular dono recusada (${isGroup ? "feita em grupo" : "código errado ou vencido"}).`);
    if (!isGroup && pedido) await sock.sendMessage(from, { text: "❌ Código errado ou vencido. Gere outro no console do site (comando: dono)." }, { quoted: msg });
    return;
  }
  try { fs.unlinkSync(arq); } catch {}
  candidatosDono(msg, from, false).forEach((u) => IDS_DONO.add(u));
  salvarDonos();
  logger.info(`🔑 [DONO] WhatsApp vinculado como dono (${candidatosDono(msg, from, false).map(mascarar).join(", ")}).`);
  await sock.sendMessage(from, { text: "✅ Pronto! Este WhatsApp agora é reconhecido como dono do bot." }, { quoted: msg });
}

function extrairTexto(message) {
  const m = normalizeMessageContent(message);
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    ""
  );
}

const ARQ_VISTAS = path.resolve("./storage/mensagens-vistas.json");
const IDADE_MAXIMA_S = 180;
const vistas = new Map();
try { for (const [id, t] of Object.entries(JSON.parse(fs.readFileSync(ARQ_VISTAS, "utf8")))) vistas.set(id, Number(t) || 0); } catch {}
let timerVistas = null;
function salvarVistas() {
  if (timerVistas) return;
  timerVistas = setTimeout(() => {
    timerVistas = null;
    try { salvarJson(ARQ_VISTAS, Object.fromEntries(vistas), { compacto: true }); } catch {}
  }, 1500);
  timerVistas.unref?.();
}
function jaTratada(msg) {
  const id = msg.key?.id;
  if (!id) return false;
  const chave = `${msg.key.remoteJid}|${id}`;
  if (vistas.has(chave)) return true;
  vistas.set(chave, Date.now());
  while (vistas.size > 400) vistas.delete(vistas.keys().next().value);
  salvarVistas();
  return false;
}
function idadeSegundos(msg) {
  const t = msg.messageTimestamp;
  const n = typeof t === "object" && t ? (typeof t.toNumber === "function" ? t.toNumber() : Number(t.low)) : Number(t);
  return n > 0 ? Date.now() / 1000 - n : 0;
}
const comandosPorChat = new Map();
function limiteDeComandos(from) {
  const agora = Date.now();
  const lista = (comandosPorChat.get(from) || []).filter((t) => agora - t < 60_000);
  if (lista.length >= 6) { comandosPorChat.set(from, lista); return true; }
  lista.push(agora);
  comandosPorChat.set(from, lista);
  if (comandosPorChat.size > 1000) comandosPorChat.clear();
  return false;
}

export const diag = { upsert: 0, processadas: 0 };

async function processarMensagem(sock, msg) {
  if (!msg?.message || !msg.key) return;
  if (jaTratada(msg)) return;
  if (!msg.key.fromMe && idadeSegundos(msg) > IDADE_MAXIMA_S) return;
  const from = msg.key.remoteJid;
  if (!from || from === "status@broadcast") return;
  const isGroup = from.endsWith("@g.us");

  if (isGroup && !msg.key.fromMe) registrarCalor(from);

  metrics.registrarMensagemRecebida();
  diag.processadas++;
  global.sorasakiPainel?.registrarAtividade(from, false);

  let senderNumber = isGroup ? (msg.key.participant || msg.participant || "") : from;
  if (senderNumber.includes(":")) {
    senderNumber = senderNumber.split(":")[0] + "@" + (senderNumber.split("@")[1] || "s.whatsapp.net");
  }
  if (!senderNumber) return;

  const textoLimpo = String(extrairTexto(msg.message) || "").trim();
  if (!textoLimpo) return;

  const isDono = ehDono(msg, from, isGroup);

  const chatComigoMesmo = [sock?.user?.id, sock?.user?.lid].map(usuarioDoJid).filter(Boolean).includes(usuarioDoJid(from));
  const conversaComCliente = msg.key.fromMe && !isGroup && !chatComigoMesmo;
  if (/^[!#./]lid$/i.test(textoLimpo) && !isGroup && (!msg.key.fromMe || chatComigoMesmo)) {
    if (Date.now() - (avisosNaoDono.get(`lid:${from}`) || 0) < 10_000) return;
    avisosNaoDono.set(`lid:${from}`, Date.now());
    const k = msg.key;
    const ids = [from, k.remoteJid, k.senderPn, k.senderLid, k.remoteJidAlt].filter(Boolean).map(String);
    const lid = ids.find((j) => j.endsWith("@lid")) || "";
    const numero = ids.find((j) => j.endsWith("@s.whatsapp.net")) || "";
    const linhas = ["🆔 *SEUS IDS NO WHATSAPP*", ""];
    linhas.push(`🔒 LID: ${lid ? `*${lid}*` : "_o WhatsApp não mandou o LID nesta conversa_"}`);
    linhas.push(`📞 Número: ${numero ? `*${usuarioDoJid(numero)}*` : "_escondido pelo WhatsApp_"}`);
    linhas.push(`👑 Dono: ${isDono ? "✅ você já é reconhecido como dono" : "❌ ainda não é reconhecido"}`);
    if (lid) linhas.push("", "*Para virar dono*, no `config.js` coloque:", `lid: "${lid}"`, "e reinicie o bot.");
    logger.info(`🆔 [LID] ${mascarar(usuarioDoJid(from))} pediu os próprios IDs (lid: ${lid || "—"}, número: ${numero ? mascarar(usuarioDoJid(numero)) : "—"}).`);
    await sock.sendMessage(from, { text: linhas.join("\n") }, { quoted: msg });
    return;
  }

  const prefixo = CONFIG.bot.prefix;
  const estruturarComando = textoLimpo.startsWith(prefixo) ? textoLimpo.slice(prefixo.length).trim() : textoLimpo;
  const commandName = estruturarComando.split(/\s+/).shift()?.toLowerCase();

  const vinculo = new RegExp(`^${prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}dono\\s+(\\d{6})$`, "i").exec(textoLimpo);
  if (vinculo && !msg.key.fromMe) return vincularDono({ sock, msg, from, isGroup, codigo: vinculo[1] });

  const consumidoPeloMenu = conversaComCliente ? false : await interceptarDivulgacao({ sock, from, textoLimpo, isDono, commandName });
  if (consumidoPeloMenu) return;

  const comando = textoLimpo.startsWith(prefixo) && commandName && !conversaComCliente ? global.commands?.get(commandName) : null;
  if (!comando && isDono && !isGroup && (!msg.key.fromMe || chatComigoMesmo) && textoLimpo.startsWith(prefixo) && /^[a-z0-9çãéêáíóõú_-]{2,30}$/i.test(commandName || "")) {
    await sock.sendMessage(from, { text: `Não conheço o comando *${prefixo}${commandName}*. Mande *${prefixo}menu* para ver a lista.` }, { quoted: msg });
    return;
  }
  if (!comando) {
    if (msg.key.fromMe) registrarMensagemDono(from, msg.key.id);
    else responderAutomatico({ sock, msg, from, isGroup, texto: textoLimpo }).catch((e) => logger.warn(`⚠️ [RESPOSTAS] ${e.message}`));
    return;
  }

  if (limiteDeComandos(from)) {
    logger.warn(`🛑 [COMANDOS] Muitos comandos seguidos em ${mascarar(usuarioDoJid(from))}: ignorando por um minuto para evitar repetição em massa.`);
    return;
  }
  const args = estruturarComando.split(/\s+/).slice(1);

  const painel = global.sorasakiPainel;
  const bloqueio = painel?.motivoBloqueio
    ? painel.motivoBloqueio(from, comando.name, { categoria: comando.categoria, isDono })
    : painel?.comandoPermitido && !painel.comandoPermitido(from, comando.name, { categoria: comando.categoria, isDono }) ? "bloqueado pelo painel" : null;
  if (bloqueio) {
    logger.warn(`🔒 [COMANDOS] ${prefixo}${commandName} não executado: ${bloqueio}.`);
    return;
  }
  if (comando.categoria === "dono" && !isDono) {
    logger.warn(`🔒 [COMANDOS] ${prefixo}${commandName} recusado: quem mandou (${candidatosDono(msg, from, isGroup).map(mascarar).join(", ") || "?"}) não foi reconhecido como dono. Se foi você, ${comoVincular()}.`);
    if (!isGroup && Date.now() - (avisosNaoDono.get(from) || 0) > 10 * 60_000) {
      avisosNaoDono.set(from, Date.now());
      if (avisosNaoDono.size > 500) avisosNaoDono.clear();
      await sock.sendMessage(from, { text: "Esse comando é só para o dono do bot." }, { quoted: msg });
    }
    return;
  }

  metrics.registrarMensagemProcessada({ senderJid: senderNumber });
  global.sorasakiPainel?.registrarAtividade(from, true);

  const inicio = Date.now();
  let sucesso = true;
  try {
    await comando.execute({ sock, from, msg, args, isGroup, senderNumber, isDono });
  } catch (err) {
    sucesso = false;
    throw err;
  } finally {
    metrics.registrarComando({ nome: commandName, sucesso, duracaoMs: Date.now() - inicio });
  }
}

export default function messageHandler(sock) {
  global.sock = sock;

  sock.ev.on("messages.upsert", async (chatUpdate) => {
    if (!chatUpdate?.messages?.length) return;
    const recuperadas = chatUpdate.type === "append";
    if (!recuperadas && chatUpdate.type !== "notify") return;
    diag.upsert += chatUpdate.messages.length;
    for (const msg of chatUpdate.messages) {
      if (recuperadas && (!msg.message || idadeSegundos(msg) > IDADE_MAXIMA_S || idadeSegundos(msg) <= 0)) continue;
      registrarRecebida(msg, { comando: (() => { try { return String(extrairTexto(msg.message) || "").trim().startsWith(CONFIG.bot.prefix); } catch { return false; } })() });
      try {
        await Promise.race([
          processarMensagem(sock, msg),
          new Promise((_, falha) => setTimeout(() => falha(new Error("a mensagem demorou mais de 45 s para ser processada")), 45_000))
        ]);
      } catch (errUpsert) {
        logger.error(`Erro no handler de mensagens: ${errUpsert.message}`);
        metrics.registrarErro({ modulo: "messages", erro: errUpsert });
      }
    }
  });
}
