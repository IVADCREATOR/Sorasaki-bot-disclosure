
import logger from "../utils/logger.js";
import { hashIdentificador } from "./anonymize.js";
import * as store from "./store.js";

const STATUS = {
  ONLINE: "online",
  OFFLINE: "offline",
  CONECTANDO: "conectando",
  RECONECTANDO: "reconectando",
  INSTAVEL: "instavel"
};

let statusAtual = STATUS.CONECTANDO;
let sessaoOnlineDesde = null;
let getSockAtivo = null;

function sanitizarMensagemErro(msg) {
  if (!msg) return "erro desconhecido";
  let texto = typeof msg === "string" ? msg : (msg?.message || String(msg));

  texto = texto
    .replace(/\d{8,}@[a-z.]+/gi, "[jid]")
    .replace(/\+?\d{10,15}/g, "[numero]")
    .replace(/\/[\w./-]{4,}/g, "[caminho]")
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, "[dados]");

  return texto.slice(0, 300);
}

export function setStatus(novoStatus) {
  statusAtual = novoStatus;
}

export function getStatus() {
  return statusAtual;
}

export function onConexaoAberta() {
  statusAtual = STATUS.ONLINE;
  sessaoOnlineDesde = Date.now();
  store.registrarConexaoAberta();

  const foiRecuperacao = store.getState().system.totalQuedas > 0;
  if (foiRecuperacao) {
    const quedas = store.getState().system.quedas;
    if (quedas[0] && quedas[0].fim === null) {
      store.registrarRecuperacao();
    }
  }
}

export function onConexaoFechando({ motivo } = {}) {
  statusAtual = STATUS.OFFLINE;
  sessaoOnlineDesde = null;
  store.registrarQueda({ motivo: motivo || "desconhecido" });
}

export function onReconectando() {
  statusAtual = STATUS.RECONECTANDO;
}

export function onInstabilidade() {
  statusAtual = STATUS.INSTAVEL;
}

export function getUptimeSessaoMs() {
  if (!sessaoOnlineDesde) return 0;
  return Date.now() - sessaoOnlineDesde;
}

export function registrarMensagemRecebida() {
  store.registrarMensagem("recebida");
}

export function registrarMensagemProcessada({ senderJid } = {}) {
  store.registrarMensagem("processada");
  if (senderJid) store.registrarUsuarioUnico(hashIdentificador(senderJid));
}

export function registrarMensagemIgnorada() {
  store.registrarMensagem("ignorada");
}

export function registrarMensagemEnviada() {
  store.registrarMensagem("enviada");
}

export function registrarComando({ nome, sucesso, duracaoMs }) {
  if (!nome) return;
  store.registrarComando({ nome, sucesso: sucesso !== false, duracaoMs });
}

export function registrarErro({ modulo, erro }) {
  const mensagem = sanitizarMensagemErro(erro);
  store.registrarErro({ modulo: modulo || "desconhecido", mensagem });
}

export function atualizarAutodisparo(dados) {
  store.atualizarAutodisparo(dados);
}

export function incrementarAutodisparo(delta) {
  store.incrementarAutodisparo(delta);
}

export function configurarFonteDeSocket(fn) {
  getSockAtivo = fn;
}

export async function medirPingUmaVez() {
  if (!getSockAtivo) return;
  const sock = getSockAtivo();
  if (!sock || statusAtual !== STATUS.ONLINE) return;

  const inicio = Date.now();
  try {
    await sock.query({
      tag: "iq",
      attrs: { id: sock.generateMessageTag(), to: "s.whatsapp.net", type: "get", xmlns: "w:p" },
      content: [{ tag: "ping", attrs: {} }]
    });
    const ms = Date.now() - inicio;
    store.registrarPing(ms);
  } catch (err) {
    logger.warn(`[metrics] Falha ao medir ping: ${err?.message || err}`);
  }
}

let timerPing = null;

export function iniciarPublicacaoNaPonte() {
}

export function pararPublicacaoNaPonte() {
}

export function iniciarMedicaoPeriodicaDePing(intervaloMs = 30_000) {
  if (timerPing) return;
  timerPing = setInterval(medirPingUmaVez, intervaloMs);
  timerPing.unref?.();
}

export function getSnapshot() {
  const s = store.getState();
  const hoje = new Date().toISOString().slice(0, 10);
  const diaHoje = s.daily[hoje] || {
    mensagensRecebidas: 0, mensagensProcessadas: 0, mensagensEnviadas: 0,
    mensagensIgnoradas: 0, comandosExecutados: 0, comandosComErro: 0,
    erros: 0, usuariosUnicos: [], porHora: new Array(24).fill(0)
  };

  const pingMedio = s.system.ping.contagem > 0
    ? Math.round(s.system.ping.somatorio / s.system.ping.contagem)
    : null;

  const comandosGerais = Object.values(s.commands).reduce(
    (acc, c) => {
      acc.usos += c.usos;
      acc.falhas += c.falhas;
      return acc;
    },
    { usos: 0, falhas: 0 }
  );

  const rankingComandos = Object.entries(s.commands)
    .map(([nome, dados]) => ({
      nome,
      usos: dados.usos,
      taxaSucesso: dados.usos > 0 ? Math.round((dados.sucessos / dados.usos) * 100) : 100,
      tempoMedioMs: dados.usos > 0 ? Math.round(dados.tempoTotalMs / dados.usos) : 0
    }))
    .sort((a, b) => b.usos - a.usos)
    .slice(0, 15);

  const diario = Object.entries(s.daily)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([dia, d]) => ({
      dia,
      mensagensProcessadas: d.mensagensProcessadas,
      comandosExecutados: d.comandosExecutados
    }));

  const bootTimestamp = s.system.bootTimestamp;
  const uptimeProcessoMs = Date.now() - bootTimestamp;
  const disponibilidade = uptimeProcessoMs > 0
    ? Math.max(0, Math.min(100, 100 - (s.system.tempoTotalOfflineMs / uptimeProcessoMs) * 100))
    : 100;

  return {
    status: statusAtual,
    uptime: {
      bootTimestamp,
      uptimeSessaoMs: getUptimeSessaoMs(),
      uptimeProcessoMs,
      disponibilidadePercentual: Number(disponibilidade.toFixed(2)),
      totalQuedas: s.system.totalQuedas,
      totalReconexoes: s.system.totalReconexoes,
      tempoTotalOfflineMs: s.system.tempoTotalOfflineMs,
      ultimaConexao: s.system.ultimaConexao,
      ultimaReconexao: s.system.ultimaReconexao,
      ultimaDesconexao: s.system.ultimaDesconexao
    },
    ping: {
      atual: s.system.ping.atual,
      min: s.system.ping.min,
      max: s.system.ping.max,
      medio: pingMedio,
      historico: s.system.ping.historico.slice(-50)
    },
    mensagens: {
      hoje: diaHoje,
      totalGeral: {
        recebidas: s.system.totalMensagensRecebidas,
        processadas: s.system.totalMensagensProcessadas,
        enviadas: s.system.totalMensagensEnviadas,
        ignoradas: s.system.totalMensagensIgnoradas
      }
    },
    comandos: {
      totalHoje: diaHoje.comandosExecutados,
      comErroHoje: diaHoje.comandosComErro,
      totalGeral: comandosGerais.usos,
      comErroGeral: comandosGerais.falhas,
      ranking: rankingComandos
    },
    usuarios: {
      unicosHoje: diaHoje.usuariosUnicos.length,
      unicosTotal: s.system.usuariosUnicosTotal.length
    },
    erros: {
      total: s.errors.total,
      hoje: diaHoje.erros,
      porModulo: s.errors.porModulo,
      ultimoErro: s.errors.ultimoErro
    },
    autodisparo: s.autodisparo,
    historico: {
      quedas: s.system.quedas.slice(0, 20),
      diario
    }
  };
}