import fs from "fs";
import path from "path";
import logger from "../utils/logger.js";
import * as metrics from "../metrics/collector.js";

const SIMILARIDADE_MINIMA = 0.8;
const MAX_POR_MINUTO = 20;
const INTERVALO_MINIMO_CHAT_MS = 3000;
const MAX_TEXTO = 500;

const dirRuntime = () => path.resolve(process.env.SORASAKI_RUNTIME_DIR || "./runtime");
const arquivoRegras = () => {
  const rt = path.join(dirRuntime(), "respostas.json");
  return fs.existsSync(rt) ? rt : path.resolve("./storage/respostas.json");
};
const arquivoUso = () => (fs.existsSync(dirRuntime()) ? path.join(dirRuntime(), "respostas-uso.json") : path.resolve("./storage/respostas-uso.json"));
const ARQ_VISTOS = path.resolve("./storage/contatos-vistos.json");

let cache = { arquivo: null, mtime: 0, conferidoEm: 0, settings: {}, regras: [] };
const ultimaPorRegra = new Map();
const ultimaPorChat = new Map();
const porChatMinuto = new Map();
const pausaDono = new Map();
const idsProprios = new Set();
const enviosRecentes = [];
let uso = null;
let timerUso = null;
let vistos = null;
let timerVistos = null;

export function normalizar(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
function bigramas(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); out.set(b, (out.get(b) || 0) + 1); }
  return out;
}
export function similaridade(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigramas(a), B = bigramas(b);
  let comum = 0;
  for (const [k, n] of A) comum += Math.min(n, B.get(k) || 0);
  return (2 * comum) / (a.length - 1 + b.length - 1);
}
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compilar(regra) {
  const padroes = (Array.isArray(regra.patterns) ? regra.patterns : []).map(String).filter(Boolean);
  const r = { ...regra, padroesNorm: padroes.map(normalizar) };
  if (regra.match_type === "contains") {
    r.testes = r.padroesNorm.map((p) => new RegExp(`(^|[^a-z0-9])${escapar(p)}($|[^a-z0-9])`));
  } else if (regra.match_type === "pattern") {
    r.testes = r.padroesNorm.map((p) => new RegExp(`^${escapar(p).replace(/\\\*/g, ".*").replace(/\\\?/g, ".")}$`));
  } else if (regra.match_type === "regex") {
    r.testes = padroes.map((p) => { try { return new RegExp(p, "iu"); } catch { return null; } }).filter(Boolean);
  }
  return r;
}

export function carregarRegras(forcar = false) {
  const agora = Date.now();
  if (!forcar && agora - cache.conferidoEm < 2000) return cache;
  cache.conferidoEm = agora;
  const arquivo = arquivoRegras();
  let mtime = 0;
  try { mtime = fs.statSync(arquivo).mtimeMs; } catch { cache = { ...cache, arquivo, mtime: 0, settings: {}, regras: [] }; return cache; }
  if (!forcar && arquivo === cache.arquivo && mtime === cache.mtime) return cache;
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    const regras = (Array.isArray(dados.rules) ? dados.rules : []).slice(0, 50).map(compilar);
    cache = { arquivo, mtime, conferidoEm: agora, settings: dados.settings || {}, regras };
    logger.info(`🤖 [RESPOSTAS] ${regras.length} regra(s) de resposta automática carregada(s).`);
  } catch (e) {
    logger.warn(`⚠️ [RESPOSTAS] Não consegui ler as regras: ${e.message}`);
  }
  return cache;
}

function dentroDoHorario(agenda, agora = new Date()) {
  if (!agenda || !Array.isArray(agenda.days)) return true;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(agora).map((x) => [x.type, x.value]));
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  const min = Number(p.hour) * 60 + Number(p.minute);
  const [hi, mi] = String(agenda.start).split(":").map(Number);
  const [hf, mf] = String(agenda.end).split(":").map(Number);
  const ini = hi * 60 + mi, fim = hf * 60 + mf;
  if (ini < fim) return agenda.days.includes(dia) && min >= ini && min < fim;
  if (min >= ini) return agenda.days.includes(dia);
  return min < fim && agenda.days.includes((dia + 6) % 7);
}

export function regraCombina(regra, { texto, isGroup, from, primeiraVez }) {
  if (regra.scope === "private" && isGroup) return false;
  if (regra.scope === "groups" && !isGroup) return false;
  if (isGroup && Array.isArray(regra.group_jids) && regra.group_jids.length && !regra.group_jids.includes(from)) return false;
  const norm = normalizar(texto).slice(0, MAX_TEXTO);
  switch (regra.match_type) {
    case "exact": return regra.padroesNorm.includes(norm);
    case "contains": return regra.testes.some((re) => re.test(norm));
    case "similar": return regra.padroesNorm.some((p) => Math.abs(p.length - norm.length) <= Math.max(6, p.length) && similaridade(p, norm) >= SIMILARIDADE_MINIMA);
    case "pattern": return regra.testes.some((re) => re.test(norm));
    case "regex": return regra.testes.some((re) => re.test(String(texto).slice(0, MAX_TEXTO)));
    case "welcome": return !isGroup && primeiraVez;
    case "any": return true;
    default: return false;
  }
}

function saudacao(d = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(d));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
async function preencher(texto, { msg, sock, from, isGroup }) {
  const d = new Date();
  const tz = { timeZone: "America/Sao_Paulo" };
  let grupo = "";
  if (isGroup && texto.includes("{grupo}")) {
    try { grupo = (await sock.groupMetadata(from))?.subject || ""; } catch {}
  }
  const nome = String(msg.pushName || "").replace(/[\u0000-\u001f]/g, "").slice(0, 40).trim();
  return texto
    .replace(/\{nome\}/gi, nome || "")
    .replace(/\{saudacao\}|\{saudação\}/gi, saudacao(d))
    .replace(/\{hora\}/gi, d.toLocaleTimeString("pt-BR", { ...tz, hour: "2-digit", minute: "2-digit" }))
    .replace(/\{data\}/gi, d.toLocaleDateString("pt-BR", tz))
    .replace(/\{dia\}/gi, d.toLocaleDateString("pt-BR", { ...tz, weekday: "long" }))
    .replace(/\{grupo\}/gi, grupo)
    .replace(/[ \t]+([,.!?])/g, "$1")
    .trim();
}

function lerJson(arq, padrao) { try { return JSON.parse(fs.readFileSync(arq, "utf8")); } catch { return padrao; } }
function gravarDepois(timerAtual, fn, ms) { if (timerAtual) return timerAtual; const t = setTimeout(fn, ms); t.unref?.(); return t; }
function contarUso(id) {
  if (!uso) uso = lerJson(arquivoUso(), { uses: {} });
  const u = uso.uses[id] || { uses: 0, last_used_at: null };
  u.uses += 1;
  u.last_used_at = new Date().toISOString();
  uso.uses[id] = u;
  timerUso = gravarDepois(timerUso, () => {
    timerUso = null;
    try { const arq = arquivoUso(); fs.writeFileSync(`${arq}.novo`, JSON.stringify(uso)); fs.renameSync(`${arq}.novo`, arq); } catch {}
  }, 3000);
}
function primeiraMensagem(from) {
  if (!vistos) vistos = new Set(lerJson(ARQ_VISTOS, []));
  if (vistos.has(from)) return false;
  vistos.add(from);
  if (vistos.size > 20000) vistos = new Set([...vistos].slice(-15000));
  timerVistos = gravarDepois(timerVistos, () => {
    timerVistos = null;
    try { fs.mkdirSync(path.dirname(ARQ_VISTOS), { recursive: true }); fs.writeFileSync(ARQ_VISTOS, JSON.stringify([...vistos])); } catch {}
  }, 5000);
  return true;
}

export function registrarMensagemDono(from, id) {
  if (!from || (id && idsProprios.has(id))) return;
  pausaDono.set(from, Date.now());
  if (pausaDono.size > 5000) pausaDono.delete(pausaDono.keys().next().value);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function responderAutomatico({ sock, msg, from, isGroup, texto }) {
  const { settings, regras } = carregarRegras();
  if (settings.enabled === false || !regras.length) return false;
  if (global.sorasakiPainel?.podeRodar && !global.sorasakiPainel.podeRodar()) return false;
  if (isGroup && global.sorasakiPainel?.recursoAtivo && !global.sorasakiPainel.recursoAtivo(from, "feature:respostas_automaticas")) return false;
  const agora = Date.now();
  const pausaMin = Number(settings.pause_after_owner_minutes) || 0;
  if (pausaMin && agora - (pausaDono.get(from) || 0) < pausaMin * 60_000) return false;
  if (agora - (ultimaPorChat.get(from) || 0) < INTERVALO_MINIMO_CHAT_MS) return false;
  const recentes = (porChatMinuto.get(from) || []).filter((t) => agora - t < 60_000);
  if (recentes.length >= 5) { porChatMinuto.set(from, recentes); return false; }
  while (enviosRecentes.length && agora - enviosRecentes[0] > 60_000) enviosRecentes.shift();
  if (enviosRecentes.length >= MAX_POR_MINUTO) return false;

  const primeiraVez = !isGroup && primeiraMensagem(from);
  const regra = regras.find((r) => {
    if (!dentroDoHorario(r.schedule)) return false;
    if (r.cooldown_minutes && agora - (ultimaPorRegra.get(`${r.id}|${from}`) || 0) < r.cooldown_minutes * 60_000) return false;
    try { return regraCombina(r, { texto, isGroup, from, primeiraVez }); } catch { return false; }
  });
  if (!regra) return false;

  const respostas = (regra.replies || []).filter(Boolean);
  if (!respostas.length) return false;
  const escolhidas = regra.reply_mode === "all" ? respostas.slice(0, 10)
    : regra.reply_mode === "random" ? [respostas[Math.floor(Math.random() * respostas.length)]]
      : [respostas[0]];

  ultimaPorChat.set(from, agora);
  recentes.push(agora);
  porChatMinuto.set(from, recentes);
  if (porChatMinuto.size > 2000) porChatMinuto.clear();
  ultimaPorRegra.set(`${regra.id}|${from}`, agora);
  if (ultimaPorRegra.size > 5000) ultimaPorRegra.clear();
  enviosRecentes.push(agora);
  contarUso(regra.id);
  logger.info(`🤖 [RESPOSTAS] Regra "${String(regra.name).slice(0, 40)}" respondeu em ${isGroup ? "grupo" : "conversa privada"}.`);

  const digitando = settings.typing !== false;
  const atrasoBase = Math.min(60, Math.max(0, Number(regra.delay_seconds) || 0)) * 1000;
  for (let i = 0; i < escolhidas.length; i++) {
    try {
      const texto2 = await preencher(String(escolhidas[i]), { msg, sock, from, isGroup });
      if (!texto2) continue;
      if (digitando) await sock.sendPresenceUpdate?.("composing", from).catch?.(() => {});
      const espera = i === 0 ? atrasoBase : Math.min(4000, 800 + texto2.length * 25);
      if (espera) await dormir(espera + Math.floor(Math.random() * 400));
      if (digitando) await sock.sendPresenceUpdate?.("paused", from).catch?.(() => {});
      const enviada = await sock.sendMessage(from, { text: texto2 }, regra.quote !== false && i === 0 ? { quoted: msg } : {});
      if (enviada?.key?.id) { idsProprios.add(enviada.key.id); if (idsProprios.size > 500) idsProprios.delete(idsProprios.values().next().value); }
      metrics.registrarMensagemEnviada?.();
    } catch (e) {
      logger.warn(`⚠️ [RESPOSTAS] Falha ao enviar resposta automática: ${e.message}`);
      break;
    }
  }
  return true;
}

export const _teste = { compilar, idsProprios, dentroDoHorario, preencher, pausaDono, ultimaPorChat, ultimaPorRegra, enviosRecentes, reiniciar: () => { cache.conferidoEm = 0; cache.mtime = 0; } };
