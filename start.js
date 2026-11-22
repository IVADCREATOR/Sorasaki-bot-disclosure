import fs from "fs";
import path from "path";
import pino from "pino";
import { pathToFileURL } from "url";
import CONFIG from "./config.js";
import * as metrics from "./metrics/collector.js";
import {
  logBootInicio,
  logBootComandosCarregados,
  logErroCritico,
  logMenuLogin,
  logQRCode,
  logPareamentoAtivo,
  logPareamentoCodigo,
  logPareamentoErro,
  logConexaoAberta,
  logLogout,
  logConflitoSessao,
  logReconectando,
  logReconectandoContinuo,
  logMaxTentativasAtingido,
  logEncerrando
} from "./events/logsstart.js";

import makeNojxSocket, {
  Browsers,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion as buscarVersaoNojxBaileys
} from "baileys";

import connectionHandler from "./events/connection.js";
import { usarEstadoSeguro as usarEstadoNojxAuth } from "./utils/auth-segura.js";
import messageHandler, { aprenderLidDono } from "./events/messages.js";
import autodisparoSystem from "./events/autodisparo.js";

export const NOJX_IVAD_777_ASSINATURA = "𝑵𝑶𝑱𝑿 • 𝑰𝑽𝑨𝑫 ⁷⁷⁷";
export const NOJX_IVAD_777_BUILD = `NOJX-IVAD777-AUTODISPARO-${Date.now().toString(36).toUpperCase()}`;

const NOJX_SESSIONS_DIR = path.resolve(process.env.BOT_SESSION_DIR || "./QR-CODE/session");
const NOJX_STORAGE_DIR  = path.resolve("./storage");
const NOJX_COMMANDS_DIR = path.resolve("./commands");

const NOJX_PASTAS_PROTEGIDAS = [
  path.resolve("."),
  path.resolve("./QR-CODE"),
  path.resolve("./QR-CODE/session"),
  path.resolve("./storage"),
  path.resolve("./storage/cache"),
  path.resolve("./events"),
  path.resolve("./utils"),
  path.resolve("./commands")
];

global.commandsNojxIvad777 = new Map();
global.commands = global.commandsNojxIvad777;

async function nojxCarregarComandos(dirPath) {
  if (!fs.existsSync(dirPath)) return;

  const itens = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const item of itens) {
    const caminhoCompleto = path.join(dirPath, item.name);

    if (item.isDirectory()) {
      await nojxCarregarComandos(caminhoCompleto);
      continue;
    }

    if (!item.name.endsWith(".js")) continue;

    try {
      const modulo = await import(pathToFileURL(caminhoCompleto).href);
      const comando = modulo.default;

      if (!comando?.name || typeof comando.execute !== "function") continue;

      if (!comando.categoria) {
        comando.categoria = path.basename(path.dirname(caminhoCompleto));
      }

      for (const apelido of [comando.name, comando.nome, ...(Array.isArray(comando.aliases) ? comando.aliases : [])]) {
        if (apelido && !global.commandsNojxIvad777.has(String(apelido).toLowerCase())) global.commandsNojxIvad777.set(String(apelido).toLowerCase(), comando);
      }
    } catch (err) {
      console.error(`  ❌ [NOJX IVAD 777] Erro carregando comando ${item.name}: ${err.message}`);
    }
  }
}

const NOJX_EXTENSOES_LIXO = new Set([
  ".jpg", ".jpeg", ".png", ".webp",
  ".mp4", ".gif", ".enc", ".tmp"
]);

const NOJX_TAMANHO_MAXIMO_LIXO = 200 * 1024;
const NOJX_PASTA_LIXO = path.resolve("./storage/cache");

function nojxProtegerGaleria() {
  for (const pasta of NOJX_PASTAS_PROTEGIDAS) {
    try {
      if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });

      const nomedia = path.join(pasta, ".nomedia");
      if (!fs.existsSync(nomedia)) {
        fs.writeFileSync(nomedia, "");
      }
    } catch {}
  }
}

function nojxLimparLixoBaileys(pastaRaiz = NOJX_PASTA_LIXO, profundidade = 0) {
  if (profundidade > 3) return;
  if (!fs.existsSync(pastaRaiz)) return;

  try {
    const itens = fs.readdirSync(pastaRaiz);
    for (const item of itens) {
      if (item === "node_modules" || item.startsWith(".")) continue;

      const caminhoCompleto = path.join(pastaRaiz, item);

      try {
        const stat = fs.statSync(caminhoCompleto);

        if (stat.isDirectory()) {
          nojxLimparLixoBaileys(caminhoCompleto, profundidade + 1);
          continue;
        }

        const ext = path.extname(item).toLowerCase();
        if (!NOJX_EXTENSOES_LIXO.has(ext)) continue;
        if (stat.size > NOJX_TAMANHO_MAXIMO_LIXO) continue;

        fs.unlinkSync(caminhoCompleto);
      } catch {}
    }
  } catch {}
}

let nojxReconnectAttempts = 0;
const NOJX_MAX_RECONNECT_ATTEMPTS = 10;
let nojxReconnectTimer = null;
let nojxEncerrando = false;
let nojxSockAtivo = null;
let nojxJaConectou = false;
let nojxReiniciando = false;

const NOJX_SAIDA_RECONECTAR = 75;

const NOJX_ARQ_ESTABILIDADE = path.resolve("./storage/estabilidade.json");
const NOJX_QUEDA_RAPIDA_MS = 5 * 60_000;
let nojxConectadoEm = 0;
function nojxLerEstabilidade() {
  try { const d = JSON.parse(fs.readFileSync(NOJX_ARQ_ESTABILIDADE, "utf8")); return { quedas: Number(d.quedas) || 0, ultima: Number(d.ultima) || 0 }; } catch { return { quedas: 0, ultima: 0 }; }
}
function nojxGravarEstabilidade(d) {
  try { fs.mkdirSync(path.dirname(NOJX_ARQ_ESTABILIDADE), { recursive: true }); fs.writeFileSync(NOJX_ARQ_ESTABILIDADE, JSON.stringify(d)); } catch {}
}
function nojxAnotarQueda() {
  if (!nojxConectadoEm || Date.now() - nojxConectadoEm >= NOJX_QUEDA_RAPIDA_MS) { nojxGravarEstabilidade({ quedas: 0, ultima: Date.now() }); return; }
  const e = nojxLerEstabilidade();
  nojxGravarEstabilidade({ quedas: e.quedas + 1, ultima: Date.now() });
}
export function nojxEsperaPorInstabilidade(agora = Date.now()) {
  const e = nojxLerEstabilidade();
  if (e.quedas < 2 || agora - e.ultima > 30 * 60_000) return 0;
  return Math.min(10 * 60_000, 30_000 * 2 ** Math.min(e.quedas - 2, 5));
}
async function nojxEsperarSeInstavel() {
  const espera = nojxEsperaPorInstabilidade();
  if (!espera) return;
  const e = nojxLerEstabilidade();
  console.log(`  ⏳ Conexão instável: o WhatsApp derrubou a conta ${e.quedas} vez(es) logo depois de conectar. Esperando ${Math.round(espera / 1000)} s antes de reconectar para o número não ser travado.`);
  const fim = Date.now() + espera;
  while (Date.now() < fim) {
    await new Promise((r) => setTimeout(r, Math.min(30_000, fim - Date.now())));
    if (Date.now() < fim) console.log(`  ⏳ Reconectando em ${Math.ceil((fim - Date.now()) / 1000)} s...`);
  }
}

async function nojxReiniciarLimpo(motivo, { contarQueda = true } = {}) {
  if (nojxReiniciando || nojxEncerrando) return;
  nojxReiniciando = true;
  if (contarQueda) nojxAnotarQueda();
  console.log(`  🔁 Reiniciando o bot para reconectar do zero (${motivo}). Sessão e dados preservados.`);
  try { await nojxFlushCredsAtual(); } catch {}
  nojxDescartarSock(nojxSockAtivo);
  setTimeout(() => process.exit(NOJX_SAIDA_RECONECTAR), 1500);
}
const nojxReconectarLimpo = () => process.env.SORASAKI_PAINEL === "on" && nojxJaConectou;

let nojxFalhasPing = 0;
function nojxIniciarVigia() {
  setInterval(async () => {
    const sock = nojxSockAtivo;
    if (!sock?.query || nojxReiniciando || metrics.getStatus?.() !== "online") { nojxFalhasPing = 0; return; }
    try {
      await Promise.race([
        sock.query({ tag: "iq", attrs: { id: sock.generateMessageTag(), to: "s.whatsapp.net", type: "get", xmlns: "w:p" }, content: [{ tag: "ping", attrs: {} }] }),
        new Promise((_, falha) => setTimeout(() => falha(new Error("sem resposta")), 25_000))
      ]);
      nojxFalhasPing = 0;
    } catch {
      nojxFalhasPing++;
      console.warn(`  ⚠️ [VIGIA] O WhatsApp não respondeu ao ping (${nojxFalhasPing}/2).`);
      if (nojxFalhasPing < 2) return;
      nojxFalhasPing = 0;
      if (nojxReconectarLimpo()) return nojxReiniciarLimpo("conexão sem resposta");
      try { sock.end(new Error("conexão sem resposta")); } catch {}
    }
  }, 4 * 60_000).unref?.();
}
let nojxFlushCredsAtual = async () => {};

const nojxDiag = { chegaram: 0, status: 0, porTipo: {}, totalChegaram: 0, totalLiberadas: 0, destravadas: 0, nacks: 0, falhasCripto: 0 };

const nojxNos = new Map();
function nojxNack(sock, info) {
  if (!info || info.nack) return;
  info.nack = true;
  const a = info.attrs;
  const attrs = { id: a.id, to: a.from, class: "message", error: "500" };
  if (a.participant) attrs.participant = a.participant;
  if (a.recipient) attrs.recipient = a.recipient;
  if (a.type) attrs.type = a.type;
  sock?.sendNode?.({ tag: "ack", attrs }).then(() => { nojxDiag.nacks++; }).catch(() => {});
}
setInterval(() => {
  const agora = Date.now();
  for (const [id, info] of nojxNos) {
    if (agora - info.em > 10 * 60_000) { nojxNos.delete(id); continue; }
    if (!info.visto && !info.nack && agora - info.em > 3 * 60_000 && metrics.getStatus?.() === "online") nojxNack(nojxSockAtivo, info);
  }
}, 30_000).unref?.();
setInterval(async () => {
  try {
    const { diag } = await import("./events/messages.js");
    const tipos = Object.entries(nojxDiag.porTipo).map(([t, n]) => `${t}: ${n}`).join(", ") || "nenhuma";
    console.log(`  📊 [DIAG] Últimos 10 min: ${nojxDiag.chegaram} mensagem(ns) chegaram do WhatsApp · liberadas pela biblioteca (${tipos}) · ${diag.processadas} tratada(s) pelo bot · ${nojxDiag.falhasCripto} não abriram · ${nojxDiag.nacks} confirmada(s) na marra · sincronização ${nojxDiag.sync ? "concluída" : "NÃO concluída"} · fila de eventos ${nojxSockAtivo?.ev?.isBuffering?.() ? "PRESA" : "livre"} · ${nojxDiag.destravadas} destravada(s).`);
    nojxDiag.chegaram = 0; nojxDiag.status = 0; nojxDiag.porTipo = {}; nojxDiag.destravadas = 0; nojxDiag.nacks = 0; nojxDiag.falhasCripto = 0; diag.upsert = 0; diag.processadas = 0;
  } catch {}
}, 10 * 60_000).unref?.();

let nojxMarca = { chegaram: 0, liberadas: 0, desde: Date.now(), soltou: false };
let nojxPresaDesde = 0, nojxAbertoEm = 0;
setInterval(() => {
  const s = nojxSockAtivo;
  const agora = Date.now();
  const novaMarca = () => { nojxMarca = { chegaram: nojxDiag.totalChegaram, liberadas: nojxDiag.totalLiberadas, desde: agora, soltou: false }; };
  if (!s || nojxReiniciando || nojxEncerrando || metrics.getStatus?.() !== "online") return novaMarca();
  const chegaram = nojxDiag.totalChegaram - nojxMarca.chegaram;
  const liberadas = nojxDiag.totalLiberadas - nojxMarca.liberadas;
  if (s.ev?.isBuffering?.() && agora - (nojxAbertoEm || agora) > 60_000) {
    if (!nojxPresaDesde) nojxPresaDesde = agora;
    else if (agora - nojxPresaDesde >= 20_000) { try { s.ev.flush(); } catch {} nojxDiag.destravadas++; nojxPresaDesde = 0; }
  } else nojxPresaDesde = 0;
  if (liberadas > 0 || chegaram < 5) return novaMarca();
  const parado = agora - nojxMarca.desde;
  if (parado >= 60_000 && !nojxMarca.soltou) {
    nojxMarca.soltou = true;
    const presa = s.ev?.isBuffering?.();
    console.warn(`  🧰 [DESTRAVAR] ${chegaram} mensagem(ns) chegaram e nenhuma foi liberada em 1 min (fila ${presa ? "PRESA" : "livre"}). Soltando a fila...`);
    try { s.ev?.flush?.(); } catch {}
    nojxDiag.destravadas++;
    return;
  }
  if (parado >= 3 * 60_000) {
    console.warn("  🧰 [DESTRAVAR] Continua travado depois de soltar a fila. Reiniciando a conexão do zero (sessão preservada).");
    novaMarca();
    nojxReiniciarLimpo("mensagens travadas", { contarQueda: false });
  }
}, 20_000).unref?.();

let nojxForaDesde = 0;
setInterval(() => {
  if (!nojxJaConectou || nojxReiniciando || nojxEncerrando || metrics.getStatus?.() === "online") { nojxForaDesde = 0; return; }
  if (!nojxForaDesde) { nojxForaDesde = Date.now(); return; }
  if (Date.now() - nojxForaDesde < 4 * 60_000) return;
  nojxForaDesde = 0;
  console.warn("  ⚠️ [VIGIA] A conexão caiu e não voltou em 4 min. Reiniciando o bot do zero (sessão preservada).");
  nojxReiniciarLimpo("reconexão travada", { contarQueda: false });
}, 30_000).unref?.();

function nojxMemoriaDoPlanoMb() {
  for (const arq of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try { const v = Number(fs.readFileSync(arq, "utf8").trim()); if (v > 0 && v < 64 * 1024 ** 3) return Math.round(v / 1048576); } catch {}
  }
  try { const m = /^MEMORY=(\d+)/m.exec(fs.readFileSync(path.resolve("squarecloud.app"), "utf8")); if (m) return Number(m[1]); } catch {}
  return 256;
}
const NOJX_LIMITE_RAM_MB = Number(process.env.BOT_RAM_LIMITE_MB) || Math.round(nojxMemoriaDoPlanoMb() * 0.85);
console.log(`  🧠 [MEMÓRIA] Plano com ~${nojxMemoriaDoPlanoMb()} MB · reinício preventivo acima de ${NOJX_LIMITE_RAM_MB} MB.`);
setInterval(async () => {
  const mb = Math.round(process.memoryUsage().rss / 1048576);
  if (mb < NOJX_LIMITE_RAM_MB || nojxReiniciando || nojxEncerrando) return;
  console.warn(`  🧠 [MEMÓRIA] O bot está usando ${mb} MB (limite seguro ${NOJX_LIMITE_RAM_MB} MB). Salvando a sessão e reiniciando antes que a hospedagem derrube.`);
  nojxReiniciando = true;
  try { await nojxFlushCredsAtual(); } catch {}
  try { nojxSockAtivo?.ev?.removeAllListeners(); nojxSockAtivo?.end?.(undefined); } catch {}
  setTimeout(() => process.exit(1), 3000);
}, 60_000).unref?.();

const nojxLoggerBaileys = pino({ level: "fatal" });

const NOJX_VERSAO_FIXA_FALLBACK = [2, 3000, 1044006379];
let nojxUsarVersaoFixa = false;

function nojxGetReconnectDelay(attempt) {
  return Math.min(1000 * 2 ** attempt, 60000);
}

async function nojxAgendarReconexao(onNewSock) {
  if (nojxReconnectTimer || nojxEncerrando) return;

  const delay = nojxGetReconnectDelay(nojxReconnectAttempts);
  nojxReconnectAttempts++;

  if (nojxReconnectAttempts === NOJX_MAX_RECONNECT_ATTEMPTS + 1) {
    logMaxTentativasAtingido();
  }

  if (nojxReconnectAttempts <= NOJX_MAX_RECONNECT_ATTEMPTS) {
    logReconectando(nojxReconnectAttempts, NOJX_MAX_RECONNECT_ATTEMPTS, delay / 1000);
  } else {
    logReconectandoContinuo(nojxReconnectAttempts, delay / 1000);
  }

  nojxReconnectTimer = setTimeout(async () => {
    nojxReconnectTimer = null;
    await nojxFlushCredsAtual();
    nojxDescartarSock(nojxSockAtivo);
    try {
      nojxSockAtivo = await nojxCriarSock(onNewSock);
      onNewSock?.(nojxSockAtivo);
    } catch (err) {
      console.error(`  ❌ [NOJX IVAD 777] Falha ao recriar a conexão: ${err?.message || err}`);
      nojxAgendarReconexao(onNewSock);
    }
  }, delay);
}

function nojxDescartarSock(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch {}
  try { sock.end(undefined); } catch {}
}

const NOJX_STORE_MAX_CHATS = 120;
const NOJX_STORE_MAX_POR_CHAT = 12;

function nojxCriarStore() {
  const messages = new Map();
  return {
    bind(ev) {
      ev.on("messages.upsert", ({ messages: novas }) => {
        for (const msg of novas) {
          const jid = msg.key?.remoteJid;
          if (!jid || !msg.message) continue;
          let lista = messages.get(jid);
          if (lista) messages.delete(jid);
          else lista = [];
          lista.push({ id: msg.key.id, message: msg.message });
          if (lista.length > NOJX_STORE_MAX_POR_CHAT) lista.splice(0, lista.length - NOJX_STORE_MAX_POR_CHAT);
          messages.set(jid, lista);
          if (messages.size > NOJX_STORE_MAX_CHATS) messages.delete(messages.keys().next().value);
        }
      });
    },
    buscarMensagem(key) {
      return messages.get(key.remoteJid)?.find((m) => m.id === key.id)?.message;
    }
  };
}

const nojxStore = nojxCriarStore();

function nojxCriarCache(ttlMs, max) {
  const dados = new Map();
  return {
    get(chave) {
      const item = dados.get(chave);
      if (!item) return undefined;
      if (item.expira < Date.now()) { dados.delete(chave); return undefined; }
      return item.valor;
    },
    set(chave, valor) {
      dados.delete(chave);
      dados.set(chave, { valor, expira: Date.now() + ttlMs });
      if (dados.size > max) dados.delete(dados.keys().next().value);
    },
    del(chave) { dados.delete(chave); },
    flushAll() { dados.clear(); }
  };
}

const nojxCacheRetentativas = nojxCriarCache(30 * 60 * 1000, 800);
const nojxCacheGrupos = nojxCriarCache(5 * 60 * 1000, 300);

function nojxVincularCacheGrupos(ev) {
  ev.on("groups.update", (grupos) => {
    for (const g of grupos || []) {
      if (!g?.id) continue;
      if (Array.isArray(g.participants)) nojxCacheGrupos.set(g.id, g);
      else nojxCacheGrupos.del(g.id);
    }
  });
  ev.on("group-participants.update", ({ id }) => { if (id) nojxCacheGrupos.del(id); });
}

let nojxVersaoCache = null;
async function nojxVersaoWhatsApp() {
  if (nojxVersaoCache && Date.now() - nojxVersaoCache.em < 6 * 60 * 60 * 1000) return nojxVersaoCache.version;
  try {
    const resultado = await buscarVersaoNojxBaileys();
    if (!resultado?.error && Array.isArray(resultado?.version)) {
      nojxVersaoCache = { version: resultado.version, em: Date.now() };
    }
    return resultado?.version || NOJX_VERSAO_FIXA_FALLBACK;
  } catch {
    return NOJX_VERSAO_FIXA_FALLBACK;
  }
}

function nojxCreateFolder(folder) {
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
}

function nojxOptimizeSessionFolder() {
  if (!fs.existsSync(NOJX_SESSIONS_DIR)) return;
  try {
    const files = fs.readdirSync(NOJX_SESSIONS_DIR);
    for (const file of files) {
      if (file.endsWith(".tmp")) {
        try { fs.unlinkSync(path.join(NOJX_SESSIONS_DIR, file)); } catch {}
      }
    }
  } catch {}
}

function nojxClearTemporaryStorage() {
  nojxLimparLixoBaileys();
  nojxProtegerGaleria();
}

async function nojxDesenharQR(qr) {
  try {
    const { default: qrcode } = await import("qrcode-terminal");
    return await new Promise((resolve) => qrcode.generate(qr, { small: true }, resolve));
  } catch {
    return "  (instale as dependências com npm install para ver o QR aqui; o QR também é publicado no painel)";
  }
}

async function nojxInitializeStorage() {
  nojxCreateFolder(NOJX_STORAGE_DIR);
  nojxCreateFolder(NOJX_SESSIONS_DIR);
  nojxCreateFolder(path.join(NOJX_STORAGE_DIR, "cache"));
  nojxCreateFolder(NOJX_COMMANDS_DIR);

  nojxProtegerGaleria();
  nojxClearTemporaryStorage();
  nojxOptimizeSessionFolder();
}

function nojxIniciarLimpezaPeriodica() {
  const INTERVALO_LIMPEZA = 30 * 60 * 1000;
  setInterval(() => {
    nojxLimparLixoBaileys();
    nojxProtegerGaleria();
  }, INTERVALO_LIMPEZA);
}

async function nojxSolicitarMetodoLogin() {
  const metodoForcado = String(process.env.BOT_PAIRING_METHOD || "").trim().toLowerCase();
  if (metodoForcado === "qr") return "2";
  if (metodoForcado === "code" || metodoForcado === "pairing") return "1";

  if (!process.stdin.isTTY) {
    console.log("\n  ℹ️  Terminal sem teclado detectado: usando código de pareamento (defina BOT_PAIRING_METHOD=qr para usar QR Code).\n");
    return "1";
  }

  logMenuLogin();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("\n  ⏱️  [NOJX IVAD 777] Tempo esgotado — usando código de pareamento por padrão.\n");
      resolve("1");
    }, 30000);

    process.stdin.once("data", (data) => {
      clearTimeout(timeout);
      resolve(data.toString().trim());
    });
  });
}

async function nojxSolicitarNumeroPareamento() {
  const metodoForcado = String(process.env.BOT_PAIRING_METHOD || "").trim().toLowerCase();
  const numeroBot = String(process.env.BOT_PAIRING_NUMBER || CONFIG.bot.number || "").replace(/[^0-9]/g, "");
  if (numeroBot) return numeroBot;
  if (!process.stdin.isTTY) {
    console.log("\n  ❌ Sem terminal para digitar o número. Defina BOT_PAIRING_NUMBER (número do bot) nas variáveis de ambiente e reinicie.\n");
    process.exit(1);
  }

  logPareamentoAtivo();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("\n  ⏱️  [NOJX IVAD 777] Tempo esgotado — encerrando.\n");
      process.exit(1);
    }, 60000);

    process.stdin.once("data", (data) => {
      clearTimeout(timeout);
      resolve(data.toString().trim().replace(/[^0-9]/g, ""));
    });
  });
}

function nojxPublicarPareamento(dados) {
  if (process.env.SORASAKI_PAINEL !== "on") return;
  try {
    const dir = path.resolve(process.env.SORASAKI_RUNTIME_DIR || "./runtime");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = path.join(dir, `pairing.json.${process.pid}.novo`);
    fs.writeFileSync(tmp, JSON.stringify({ updated_at: new Date().toISOString(), ...dados }, null, 2));
    fs.renameSync(tmp, path.join(dir, "pairing.json"));
  } catch {}
}

async function nojxCriarSock(onNewSock) {
  const { state, saveCreds } = await usarEstadoNojxAuth(NOJX_SESSIONS_DIR);

  let version;
  if (nojxUsarVersaoFixa) {
    version = NOJX_VERSAO_FIXA_FALLBACK;
    console.log(`  ⚙️  [NOJX IVAD 777] Usando versão fixa do WhatsApp Web (fallback 405): ${version.join(".")}\n`);
  } else {
    version = await nojxVersaoWhatsApp();
  }

  const nojxSock = makeNojxSocket({
    version,
    logger: nojxLoggerBaileys,
    browser: Browsers.macOS("Chrome"),
    msgRetryCounterCache: nojxCacheRetentativas,
    cachedGroupMetadata: async (jid) => nojxCacheGrupos.get(jid),
    generateHighQualityLinkPreview: false,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, nojxLoggerBaileys) },
    keepAliveIntervalMs: 30000,
    emitOwnEvents: true,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldIgnoreJid: (jid) => jid?.endsWith("@broadcast"),
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    getMessage: async (key) => nojxStore.buscarMensagem(key)
  });

  nojxSock.assinaturaNojxIvad777 = NOJX_IVAD_777_ASSINATURA;
  try {
    nojxSock.ev.on("connection.update", (u) => { if (u?.connection === "open") { nojxAbertoEm = Date.now(); nojxDiag.sync = false; } });
    nojxSock.ws.on("CB:ib,,offline", (node) => {
      nojxDiag.sync = true;
      const n = node?.content?.find?.((x) => x.tag === "offline")?.attrs?.count;
      console.log(`  ✅ [SYNC] O WhatsApp terminou de entregar as mensagens atrasadas${n ? ` (${n})` : ""}. A partir de agora chegam ao vivo.`);
    });
    nojxSock.ws.on("CB:message", (node) => {
      nojxDiag.chegaram++; nojxDiag.totalChegaram++;
      const a = node?.attrs || {};
      if (a.id && a.from) { nojxNos.set(a.id, { attrs: { id: a.id, from: a.from, participant: a.participant, recipient: a.recipient, type: a.type }, em: Date.now(), visto: false }); if (nojxNos.size > 8000) nojxNos.delete(nojxNos.keys().next().value); }
    });
    nojxSock.ev.on("messages.upsert", ({ type, messages }) => {
      const n = messages?.length || 0;
      nojxDiag.porTipo[type] = (nojxDiag.porTipo[type] || 0) + n;
      nojxDiag.totalLiberadas += n;
      for (const m of messages || []) {
        const info = nojxNos.get(m?.key?.id);
        if (!info) continue;
        info.visto = true;
        if (m.messageStubType === 2 && m.messageStubParameters?.[0] !== "Key used already or never filled") {
          nojxDiag.falhasCripto++;
          setTimeout(() => nojxNack(nojxSock, info), 3_000);
        }
      }
    });
    nojxSock.ws.on("CB:status", () => { nojxDiag.status++; });
  } catch {}

  try {
    nojxSock.ws.on("CB:status", (node) => {
      try {
        const a = node?.attrs || {};
        if (!a.id || !a.from) return;
        const attrs = { id: a.id, to: a.from, class: "status" };
        if (a.participant) attrs.participant = a.participant;
        if (a.recipient) attrs.recipient = a.recipient;
        if (a.type) attrs.type = a.type;
        nojxSock.sendNode({ tag: "ack", attrs }).catch(() => {});
      } catch {}
    });
  } catch {}

  const cadastrado = state.creds?.registered;
  if (!cadastrado) global.nojxPareamentoNovo = true;

  if (!cadastrado) {
    let codigoPedido = false;
    nojxSock.ev.on("connection.update", async ({ qr }) => {
      if (!qr) return;
      if (nojxMetodoLoginEscolhido === "2") {
        logQRCode(await nojxDesenharQR(qr));
        nojxPublicarPareamento({ method: "qr", qr });
        return;
      }
      if (codigoPedido || !nojxNumeroPareamento) return;
      codigoPedido = true;
      try {
        const bruto = await nojxSock.requestPairingCode(nojxNumeroPareamento);
        const code = String(bruto || "").match(/.{1,4}/g)?.join("-") || bruto;
        logPareamentoCodigo(code);
        nojxPublicarPareamento({ method: "code", code, phone: nojxNumeroPareamento });
      } catch (err) {
        logPareamentoErro(err.message);
      }
    });
  }

  let nojxSaveTimeout = null;
  let nojxSaveCredsPendente = false;

  async function nojxFlushCreds() {
    if (nojxSaveTimeout) {
      clearTimeout(nojxSaveTimeout);
      nojxSaveTimeout = null;
    }
    if (nojxSaveCredsPendente) {
      try { await saveCreds(); } catch {}
      nojxSaveCredsPendente = false;
    }
  }

  nojxFlushCredsAtual = nojxFlushCreds;

  nojxStore.bind(nojxSock.ev);
  nojxVincularCacheGrupos(nojxSock.ev);

  nojxSock.ev.on("messaging-history.set", () => {
    nojxOptimizeSessionFolder();
    nojxLimparLixoBaileys();
    nojxProtegerGaleria();
  });

  connectionHandler(nojxSock, {
    sessionsDir: NOJX_SESSIONS_DIR,
    onOpen: () => {
      nojxJaConectou = true;
      nojxConectadoEm = Date.now();
      setTimeout(() => { if (nojxConectadoEm && Date.now() - nojxConectadoEm >= 10 * 60_000 - 1000) nojxGravarEstabilidade({ quedas: 0, ultima: Date.now() }); }, 10 * 60_000).unref?.();
      nojxFalhasPing = 0;
      nojxReconnectAttempts = 0;
      logConexaoAberta();
      aprenderLidDono(nojxSock).catch(() => {});
      nojxLimparLixoBaileys();
      nojxProtegerGaleria();
      nojxPublicarPareamento({ method: "connected" });
      if (global.nojxPareamentoNovo && process.env.SORASAKI_PAINEL === "on") {
        global.nojxPareamentoNovo = false;
        console.log("  🔁 Número pareado! Vou religar uma vez para deixar a conexão firme (sessão preservada).");
        setTimeout(() => nojxReiniciarLimpo("primeira conexão concluída", { contarQueda: false }), 12_000).unref?.();
      }
    },
    onReconnect: () => (nojxReconectarLimpo() ? nojxReiniciarLimpo("a conexão caiu") : nojxAgendarReconexao(onNewSock)),
    onFatal: async (tipo) => {
      if (tipo === "loggedOut") logLogout();
      if (tipo === "conflict") logConflitoSessao();
      await nojxFlushCreds();
    },
    on405: () => {
      if (!nojxUsarVersaoFixa) {
        nojxUsarVersaoFixa = true;
        console.log(
          `\n  ⚠️  [NOJX IVAD 777] Conexão encerrada com erro 405 (Connection Failure — rejeição do servidor do WhatsApp).\n` +
          `      Ativando versão fixa do WhatsApp Web (${NOJX_VERSAO_FIXA_FALLBACK.join(".")}) na próxima tentativa.\n`
        );
      }
    }
  });

  messageHandler(nojxSock);

  if (autodisparoSystem?.execute) autodisparoSystem.execute(nojxSock);

  nojxSock.ev.on("creds.update", () => {
    nojxSaveCredsPendente = true;
    if (nojxSaveTimeout) clearTimeout(nojxSaveTimeout);
    nojxSaveTimeout = setTimeout(async () => {
      nojxSaveTimeout = null;
      try {
        await saveCreds();
        nojxSaveCredsPendente = false;
      } catch {}
    }, 500);
  });

  return nojxSock;
}

let nojxMetodoLoginEscolhido = "1";
let nojxNumeroPareamento = "";

export async function connectToWhatsApp(onNewSock) {
  const { state } = await usarEstadoNojxAuth(NOJX_SESSIONS_DIR);
  const cadastrado = state.creds?.registered;

  if (!cadastrado) {
    nojxMetodoLoginEscolhido = await nojxSolicitarMetodoLogin();
    if (nojxMetodoLoginEscolhido === "3") process.exit(0);
    if (nojxMetodoLoginEscolhido !== "1" && nojxMetodoLoginEscolhido !== "2") nojxMetodoLoginEscolhido = "1";
    if (nojxMetodoLoginEscolhido === "1") {
      nojxNumeroPareamento = await nojxSolicitarNumeroPareamento();
      if (!nojxNumeroPareamento) process.exit(1);
    }
  }

  nojxSockAtivo = await nojxCriarSock(onNewSock);
  return nojxSockAtivo;
}

export function getActiveSock() {
  return nojxSockAtivo;
}

export async function encerrarSock() {
  nojxEncerrando = true;
  if (nojxReconnectTimer) { clearTimeout(nojxReconnectTimer); nojxReconnectTimer = null; }
  if (nojxSockAtivo) {
    await nojxFlushCredsAtual();
    nojxDescartarSock(nojxSockAtivo);
  }
}

export default async function start() {
  try {
    console.log(`\n  ${NOJX_IVAD_777_ASSINATURA}\n  Build: ${NOJX_IVAD_777_BUILD}\n`);

    logBootInicio();

    await nojxInitializeStorage();
    nojxIniciarLimpezaPeriodica();

    await nojxCarregarComandos(NOJX_COMMANDS_DIR);
    logBootComandosCarregados(global.commandsNojxIvad777.size);

    await nojxEsperarSeInstavel();

    const sock = await connectToWhatsApp((novoSock) => {
      nojxSockAtivo = novoSock;
    });

    metrics.configurarFonteDeSocket(getActiveSock);
    nojxIniciarVigia();
    metrics.iniciarMedicaoPeriodicaDePing();
    metrics.iniciarPublicacaoNaPonte();

    return sock;
  } catch (err) {
    logErroCritico(err.message);
    process.exit(1);
  }
}
