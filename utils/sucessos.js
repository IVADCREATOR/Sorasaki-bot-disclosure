import path from "path";
import { lerJson, salvarJson, lerDivulgacao, salvarDivulgacao } from "./arquivo.js";

const DIA = 24 * 3600_000;
const FUSO_BR = -3 * 3600_000;
const ARQ_TERMO = path.resolve("./storage/termometro.json");
const ARQ_ENTREGA = path.resolve("./storage/ultima-entrega.json");
const ARQ_FALHAS = path.resolve("./storage/falhas-grupos.json");

export const agoraBr = (t = Date.now()) => new Date(t + FUSO_BR);
export const diaBr = (t = Date.now()) => agoraBr(t).toISOString().slice(0, 10);
export const horaBr = (t = Date.now()) => agoraBr(t).getUTCHours();
export const quando = (t) => new Date(t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

const ehUrl = /(https?:\/\/\S+|chat\.whatsapp\.com\/\S+|wa\.me\/\S+)/gi;
function porTrechos(texto, fn) {
  return String(texto).split(ehUrl).map((t, i) => (i % 2 ? t : fn(t))).join("");
}
export function negritoItalico(t) {
  return porTrechos(t, (s) => [...s].map((ch) => {
    const c = ch.codePointAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d468 + c - 65);
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d482 + c - 97);
    return ch;
  }).join(""));
}
export function largo(t) {
  return porTrechos(t, (s) => [...s].map((ch) => {
    const c = ch.codePointAt(0);
    if (c >= 33 && c <= 126 && ch !== "*" && ch !== "_" && ch !== "~") return String.fromCodePoint(0xff01 + c - 33);
    return ch === " " ? "　" : ch;
  }).join(""));
}
export const semAcento = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "");
export function exagerar(t) {
  const linhas = String(t).split("\n");
  const titulo = porTrechos(linhas[0], (s) => semAcento(s).toUpperCase());
  return [`🚨🔥🚨🔥🚨🔥🚨🔥🚨`, `🤯 *${titulo}* 🤯`, ...linhas.slice(1), `🚨🔥🚨🔥🚨🔥🚨🔥🚨`].join("\n");
}

let termo = lerJson(ARQ_TERMO, null);
if (!termo || typeof termo !== "object" || !termo.grupos) termo = { desde: Date.now(), dia: diaBr(), grupos: {}, horas: Array(24).fill(0) };
let timerTermo = null;
function gravarTermo() {
  if (timerTermo) return;
  timerTermo = setTimeout(() => {
    timerTermo = null;
    try { salvarJson(ARQ_TERMO, termo, { compacto: true }); } catch {}
  }, 60_000);
  timerTermo.unref?.();
}
function virarDia() {
  const hoje = diaBr();
  if (termo.dia === hoje) return;
  termo.dia = hoje;
  termo.horas = termo.horas.map((n) => Math.round(n * 0.9 * 100) / 100);
  const limite = diaBr(Date.now() - 7 * DIA);
  for (const g of Object.values(termo.grupos)) for (const d of Object.keys(g.dias || {})) if (d < limite) delete g.dias[d];
}
export function registrarCalor(jid, t = Date.now()) {
  if (!String(jid).endsWith("@g.us")) return;
  virarDia();
  const g = (termo.grupos[jid] ||= { ultima: 0, dias: {} });
  g.ultima = t;
  const d = diaBr(t);
  g.dias[d] = (g.dias[d] || 0) + 1;
  termo.horas[horaBr(t)] = (termo.horas[horaBr(t)] || 0) + 1;
  const ids = Object.keys(termo.grupos);
  if (ids.length > 3000) delete termo.grupos[ids.sort((a, b) => termo.grupos[a].ultima - termo.grupos[b].ultima)[0]];
  gravarTermo();
}
export function calor(jid) {
  const g = termo.grupos[jid];
  if (!g) return 0;
  const limite = diaBr(Date.now() - 7 * DIA);
  return Object.entries(g.dias || {}).reduce((s, [d, n]) => (d >= limite ? s + n : s), 0);
}
export const ultimaMensagem = (jid) => termo.grupos[jid]?.ultima || 0;
export const termometroDesde = () => termo.desde;
export function melhoresHoras(n = 3) {
  return termo.horas.map((v, h) => ({ h, v })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, n).map((x) => x.h);
}
export function salvarTermometroAgora() {
  try { salvarJson(ARQ_TERMO, termo, { compacto: true }); } catch {}
}

export function lerEntrega() {
  const e = lerJson(ARQ_ENTREGA, null);
  return e && typeof e === "object" && Array.isArray(e.entregues) ? e : null;
}
export function falhasSeguidas() {
  const f = lerJson(ARQ_FALHAS, {});
  return f && typeof f === "object" && !Array.isArray(f) ? f : {};
}
export function registrarEntrega(entrega) {
  try { salvarJson(ARQ_ENTREGA, entrega); } catch {}
  const f = falhasSeguidas();
  for (const g of entrega.entregues) delete f[g.id];
  for (const g of entrega.falhas) f[g.id] = (Number(f[g.id]) || 0) + 1;
  try { salvarJson(ARQ_FALHAS, f, { compacto: true }); } catch {}
}

export function lerRodizio(cfg = lerDivulgacao()) {
  const r = cfg.rodizio && typeof cfg.rodizio === "object" ? cfg.rodizio : {};
  return { ativo: r.ativo === true, textos: Array.isArray(r.textos) ? r.textos.filter((t) => typeof t === "string" && t.trim()) : [], indice: Number(r.indice) || 0 };
}
export function salvarRodizio(patch) {
  const atual = lerRodizio();
  return salvarDivulgacao({ rodizio: { ...atual, ...patch } }).rodizio;
}
export function textoDaVez(cfg, { avancar = true } = {}) {
  const r = lerRodizio(cfg);
  if (r.ativo && r.textos.length) {
    const i = r.indice % r.textos.length;
    if (avancar) salvarRodizio({ indice: (i + 1) % r.textos.length });
    return { texto: r.textos[i], posicao: i + 1, total: r.textos.length };
  }
  const texto = (Array.isArray(cfg.mensagens) && cfg.mensagens[0]) || cfg.mensagem || "";
  return { texto, posicao: null, total: null };
}

const SAUDACAO = (h) => (h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite");
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export function pintar(texto, { nome = "", membros = 0 } = {}, sortear = Math.random) {
  let t = String(texto);
  for (let i = 0; i < 5 && /\{[^{}]*\|[^{}]*\}/.test(t); i++) {
    t = t.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, opcoes) => { const l = opcoes.split("|"); return l[Math.floor(sortear() * l.length)]; });
  }
  const br = agoraBr();
  const vars = { grupo: nome || "pessoal", membros: String(membros || ""), saudacao: SAUDACAO(br.getUTCHours()), hora: `${String(br.getUTCHours()).padStart(2, "0")}:${String(br.getUTCMinutes()).padStart(2, "0")}`,
    data: `${String(br.getUTCDate()).padStart(2, "0")}/${String(br.getUTCMonth() + 1).padStart(2, "0")}`, dia: DIAS[br.getUTCDay()] };
  return t.replace(/\{(grupo|membros|saudacao|hora|data|dia)\}/gi, (_, v) => vars[v.toLowerCase()]);
}

export function lerHorarios(cfg = lerDivulgacao()) {
  return (Array.isArray(cfg.horarios) ? cfg.horarios : []).filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h));
}
export function normalizarHorario(v) {
  const m = /^(\d{1,2})(?:[:h.](\d{2}))?h?$/i.exec(String(v).trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] || 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
export function proximoHorario(horarios, depoisDe = Date.now()) {
  if (!horarios.length) return null;
  const base = agoraBr(depoisDe);
  const meiaNoite = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()) - FUSO_BR;
  let melhor = null;
  for (let dia = 0; dia < 2; dia++) {
    for (const h of horarios) {
      const [hh, mm] = h.split(":").map(Number);
      const t = meiaNoite + dia * DIA + (hh * 60 + mm) * 60_000;
      if (t > depoisDe && (melhor === null || t < melhor)) melhor = t;
    }
  }
  return melhor;
}

export function textoDoComando(msg, subcomando = false) {
  const m = msg.message || {};
  const q = m.extendedTextMessage?.contextInfo?.quotedMessage;
  const original = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || "";
  let t = original.replace(/^\s*\S+[ \t]*/, "");
  if (subcomando) t = t.replace(/^\S+[ \t]*/, "");
  t = t.replace(/^\r?\n/, "").trim();
  if (!t && q) t = String(q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || "").trim();
  return t;
}
export const titulo = (emoji, nome, artista) => `${emoji} *${negritoItalico(nome.toUpperCase())}*\n_${artista}_`;
