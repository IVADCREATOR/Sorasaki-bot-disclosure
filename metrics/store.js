
import fs from "fs";
import path from "path";
import logger from "../utils/logger.js";

const DIR = path.resolve("./storage/metrics");
const FLUSH_INTERVAL_MS = 10_000;
const DIAS_RETENCAO = 35;
const MAX_ERROS_HISTORICO = 50;
const MAX_QUEDAS_HISTORICO = 100;
const MAX_PING_HISTORICO = 500;

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const ARQUIVOS = {
  system: path.join(DIR, "system.json"),
  daily: path.join(DIR, "daily.json"),
  commands: path.join(DIR, "commands.json"),
  errors: path.join(DIR, "errors.json"),
  autodisparo: path.join(DIR, "autodisparo.json")
};

function lerJson(caminho, fallback) {
  try {
    if (!fs.existsSync(caminho)) return fallback;
    const conteudo = fs.readFileSync(caminho, "utf-8").trim();
    if (!conteudo) return fallback;
    return JSON.parse(conteudo);
  } catch (err) {
    logger.error(`[metrics/store] Falha ao ler ${caminho}: ${err.message}`);
    return fallback;
  }
}

function escreverJsonImediato(caminho, dados) {
  try {
    fs.writeFileSync(caminho, JSON.stringify(dados, null, 2));
  } catch (err) {
    logger.error(`[metrics/store] Falha ao gravar ${caminho}: ${err.message}`);
  }
}


const state = {
  system: Object.assign(
    {
      bootTimestamp: Date.now(),
      ultimaConexao: null,
      ultimaReconexao: null,
      ultimaDesconexao: null,
      totalReconexoes: 0,
      totalQuedas: 0,
      tempoTotalOfflineMs: 0,
      quedas: [],
      ping: { atual: null, min: null, max: null, somatorio: 0, contagem: 0, historico: [] },
      totalMensagensRecebidas: 0,
      totalMensagensProcessadas: 0,
      totalMensagensEnviadas: 0,
      totalMensagensIgnoradas: 0,
      usuariosUnicosTotal: []
    },
    lerJson(ARQUIVOS.system, {})
  ),
  daily: lerJson(ARQUIVOS.daily, {}),
  commands: lerJson(ARQUIVOS.commands, {}),
  errors: lerJson(ARQUIVOS.errors, {
    total: 0,
    porModulo: {},
    ultimoErro: null,
    historico: []
  }),
  autodisparo: lerJson(ARQUIVOS.autodisparo, {
    status: false,
    intervaloMinutos: null,
    proximoDisparoEm: null,
    ultimoDisparoEm: null,
    ciclosConcluidos: 0,
    transmissoesTotais: 0,
    falhasTotais: 0
  })
};

let sujo = new Set();
let timerFlush = null;

function marcarSujo(chave) {
  sujo.add(chave);
  if (!timerFlush) {
    timerFlush = setTimeout(flush, FLUSH_INTERVAL_MS);
  }
}

function flush() {
  timerFlush = null;
  for (const chave of sujo) {
    if (ARQUIVOS[chave]) escreverJsonImediato(ARQUIVOS[chave], state[chave]);
  }
  sujo.clear();
}

process.on("SIGINT", flush);
process.on("SIGTERM", flush);
process.on("beforeExit", flush);


function diaAtual() {
  return new Date().toISOString().slice(0, 10);
}

function horaAtual() {
  return new Date().getHours();
}

function garantirDia(dia) {
  if (!state.daily[dia]) {
    state.daily[dia] = {
      mensagensRecebidas: 0,
      mensagensProcessadas: 0,
      mensagensEnviadas: 0,
      mensagensIgnoradas: 0,
      comandosExecutados: 0,
      comandosComErro: 0,
      erros: 0,
      usuariosUnicos: [],
      porHora: new Array(24).fill(0)
    };
  }
  return state.daily[dia];
}

function podarDiasAntigos() {
  const chaves = Object.keys(state.daily).sort();
  if (chaves.length <= DIAS_RETENCAO) return;
  const excedentes = chaves.slice(0, chaves.length - DIAS_RETENCAO);
  for (const dia of excedentes) delete state.daily[dia];
}


export function getState() {
  return state;
}

export function registrarMensagem(tipo) {
  const dia = garantirDia(diaAtual());
  const hora = horaAtual();

  if (tipo === "recebida") { dia.mensagensRecebidas++; state.system.totalMensagensRecebidas++; }
  else if (tipo === "processada") { dia.mensagensProcessadas++; state.system.totalMensagensProcessadas++; }
  else if (tipo === "enviada") { dia.mensagensEnviadas++; state.system.totalMensagensEnviadas++; }
  else if (tipo === "ignorada") { dia.mensagensIgnoradas++; state.system.totalMensagensIgnoradas++; }

  if (tipo === "recebida" || tipo === "processada") dia.porHora[hora]++;

  marcarSujo("daily");
  marcarSujo("system");
}

export function registrarUsuarioUnico(hash) {
  if (!hash) return;
  const dia = garantirDia(diaAtual());
  if (!dia.usuariosUnicos.includes(hash)) {
    dia.usuariosUnicos.push(hash);
    marcarSujo("daily");
  }
  if (!state.system.usuariosUnicosTotal.includes(hash)) {
    state.system.usuariosUnicosTotal.push(hash);
    marcarSujo("system");
  }
}

export function registrarComando({ nome, sucesso, duracaoMs }) {
  if (!nome) return;

  const dia = garantirDia(diaAtual());
  dia.comandosExecutados++;
  if (!sucesso) dia.comandosComErro++;
  marcarSujo("daily");

  if (!state.commands[nome]) {
    state.commands[nome] = { usos: 0, sucessos: 0, falhas: 0, tempoTotalMs: 0 };
  }
  const c = state.commands[nome];
  c.usos++;
  if (sucesso) c.sucessos++; else c.falhas++;
  if (typeof duracaoMs === "number" && duracaoMs >= 0) c.tempoTotalMs += duracaoMs;

  marcarSujo("commands");
}

export function registrarErro({ modulo, mensagem }) {
  const dia = garantirDia(diaAtual());
  dia.erros++;
  marcarSujo("daily");

  state.errors.total++;
  state.errors.porModulo[modulo] = (state.errors.porModulo[modulo] || 0) + 1;
  state.errors.ultimoErro = { modulo, mensagem, timestamp: Date.now() };
  state.errors.historico.unshift({ modulo, mensagem, timestamp: Date.now() });
  if (state.errors.historico.length > MAX_ERROS_HISTORICO) {
    state.errors.historico.length = MAX_ERROS_HISTORICO;
  }

  marcarSujo("errors");
}

export function registrarConexaoAberta() {
  state.system.ultimaConexao = Date.now();
  marcarSujo("system");
}

export function registrarQueda({ motivo }) {
  state.system.totalQuedas++;
  state.system.ultimaDesconexao = Date.now();
  state.system.quedas.unshift({ inicio: Date.now(), motivo: motivo || "desconhecido", fim: null, duracaoMs: null });
  if (state.system.quedas.length > MAX_QUEDAS_HISTORICO) state.system.quedas.length = MAX_QUEDAS_HISTORICO;
  marcarSujo("system");
}

export function registrarRecuperacao() {
  state.system.totalReconexoes++;
  state.system.ultimaReconexao = Date.now();

  const ultimaQueda = state.system.quedas[0];
  if (ultimaQueda && ultimaQueda.fim === null) {
    ultimaQueda.fim = Date.now();
    ultimaQueda.duracaoMs = ultimaQueda.fim - ultimaQueda.inicio;
    state.system.tempoTotalOfflineMs += ultimaQueda.duracaoMs;
  }

  marcarSujo("system");
}

export function registrarPing(ms) {
  if (typeof ms !== "number" || !isFinite(ms) || ms < 0) return;
  const p = state.system.ping;
  p.atual = ms;
  p.min = p.min === null ? ms : Math.min(p.min, ms);
  p.max = p.max === null ? ms : Math.max(p.max, ms);
  p.somatorio += ms;
  p.contagem++;
  p.historico.push({ ts: Date.now(), ms });
  if (p.historico.length > MAX_PING_HISTORICO) p.historico.shift();

  marcarSujo("system");
}

export function atualizarAutodisparo(dadosParciais) {
  Object.assign(state.autodisparo, dadosParciais);
  marcarSujo("autodisparo");
}

export function incrementarAutodisparo(delta) {
  for (const [chave, valor] of Object.entries(delta)) {
    state.autodisparo[chave] = (state.autodisparo[chave] || 0) + valor;
  }
  marcarSujo("autodisparo");
}

export function manutencaoDiaria() {
  podarDiasAntigos();
  marcarSujo("daily");
}

export function forcarFlush() {
  flush();
}

setInterval(manutencaoDiaria, 6 * 60 * 60 * 1000).unref?.();