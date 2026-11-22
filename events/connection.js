import fs from "fs";
import path from "path";
import { DisconnectReason } from "baileys";
import logger from "../utils/logger.js";
import CONFIG from "../config.js";
import * as metrics from "../metrics/collector.js";
import { enviarResumoDivulgacao } from "./autodisparo.js";
import { registrarEnviada } from "../utils/console-wa.js";

function aplicarPatchMidia(sock) {
  if (sock._patchMediaBypassApplied) return;

  const originalSendMessage = sock.sendMessage.bind(sock);

  sock.sendMessage = async function (jid, content, options = {}) {
    if (content?.viewOnceMessage?.message?.interactiveMessage) {
      content.viewOnceMessage.message.interactiveMessage.contextInfo = {
        ...(content.viewOnceMessage.message.interactiveMessage.contextInfo || {}),
        deviceListMetadata: {},
        deviceListMetadataVersion: 2
      };
    }
    const enviada = await originalSendMessage(jid, content, options);
    registrarEnviada(jid, content, enviada);
    acompanharEntrega(jid, enviada);
    return enviada;
  };

  sock._patchMediaBypassApplied = true;
}

const PENDENTES = new Map();
const fimDe = (jid) => `•••${String(jid).split("@")[0].slice(-4)}`;
function acompanharEntrega(jid, enviada) {
  const id = enviada?.key?.id;
  if (!id || !jid || String(jid).endsWith("@g.us") || String(jid).endsWith("@broadcast")) return;
  const t = setTimeout(() => {
    if (!PENDENTES.has(id)) return;
    PENDENTES.delete(id);
    logger.warn(`⚠️ [ENTREGA] A mensagem para ${fimDe(jid)} saiu do bot, mas o celular da pessoa não confirmou o recebimento em 60 s.`);
  }, 60_000);
  t.unref?.();
  PENDENTES.set(id, { jid, t });
  if (PENDENTES.size > 300) { const [k, v] = PENDENTES.entries().next().value; clearTimeout(v.t); PENDENTES.delete(k); }
}
function vigiarEntregas(sock) {
  sock.ev.on("messages.update", (lista) => {
    for (const { key, update } of lista || []) {
      const p = PENDENTES.get(key?.id);
      if (!p || !(Number(update?.status) >= 3)) continue;
      clearTimeout(p.t);
      PENDENTES.delete(key.id);
      logger.info(`✓✓ [ENTREGA] Mensagem entregue no celular de ${fimDe(p.jid)}.`);
    }
  });
}

let resumoEnviado = false;

function diagnosticarDesconexao(statusCode) {
  switch (statusCode) {
    case DisconnectReason.loggedOut:
      return { tipo: "loggedOut", mensagem: "Dispositivo desconectado via celular. Credenciais removidas.", deveReconectar: false, deletarSessao: true };
    case 401:
      return { tipo: "unauthorized", mensagem: "Falha de autorização — dispositivo desemparelhado.", deveReconectar: false, deletarSessao: true };
    case DisconnectReason.forbidden:
      return { tipo: "forbidden", mensagem: "Acesso recusado pelo WhatsApp (número restrito ou banido).", deveReconectar: false, deletarSessao: false };
    case DisconnectReason.badSession:
      return { tipo: "badSession", mensagem: "Erro de sessão informado pelo servidor. Tentando de novo sem apagar a sessão.", deveReconectar: true, deletarSessao: false };
    case DisconnectReason.connectionReplaced:
    case 440:
      return { tipo: "conflict", mensagem: "Conflito de sessão — outra instância está ativa.", deveReconectar: false, deletarSessao: false };
    case 405:
      return { tipo: "connectionFailure405", mensagem: "Rejeição do servidor do WhatsApp (405).", deveReconectar: true, deletarSessao: false };
    case DisconnectReason.connectionClosed:
      return { tipo: "connectionClosed", mensagem: "WebSocket encerrado abruptamente.", deveReconectar: true, deletarSessao: false };
    case DisconnectReason.restartRequired:
      return { tipo: "restartRequired", mensagem: "WhatsApp exigiu reinicialização de handshake.", deveReconectar: true, deletarSessao: false };
    case DisconnectReason.timedOut:
      return { tipo: "timedOut", mensagem: "Conexão perdida ou tempo limite excedido.", deveReconectar: true, deletarSessao: false };
    default:
      return { tipo: "other", mensagem: "Instabilidade genérica ou reinício preventivo.", deveReconectar: true, deletarSessao: false };
  }
}

export default function connectionHandler(sock, handlers = {}) {
  const { sessionsDir, onOpen, onReconnect, onFatal, on405 } = handlers;

  aplicarPatchMidia(sock);
  vigiarEntregas(sock);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      logger.info(`🔗 Estabelecendo conexão com os servidores do WhatsApp...`);
      metrics.setStatus("conectando");
    }

    if (connection === "open") {
      await logger.banner();
      logger.success(`✅ WHATSAPP CONECTADO COM SUCESSO!`);
      logger.info(`🤖 ${CONFIG.bot.name} pronto para trabalhar.`);

      metrics.onConexaoAberta();

      if (!resumoEnviado && !(global.nojxPareamentoNovo && process.env.SORASAKI_PAINEL === "on")) {
        resumoEnviado = true;
        enviarResumoDivulgacao(sock).catch((e) => logger.error(`Falha ao enviar resumo de divulgação: ${e.message}`));
      }

      onOpen?.();
    }

    if (connection === "close") {

      const statusCode = lastDisconnect?.error?.output?.statusCode
        ?? lastDisconnect?.error?.code;

      const { tipo, mensagem, deveReconectar, deletarSessao } = diagnosticarDesconexao(statusCode);

      metrics.onConexaoFechando({ motivo: tipo });

      console.log(`\n${"─".repeat(50)}`);
      logger.error(`❌ CONEXÃO ENCERRADA`);
      logger.error(`📌 Código: ${statusCode ?? "desconhecido"}`);
      logger.warn(`📌 Razão: ${lastDisconnect?.error?.message ?? "Causa indeterminada"}`);
      logger.info(`🔎 Diagnóstico: ${mensagem}`);
      try {
        const filho = Array.isArray(lastDisconnect?.error?.data?.content) ? lastDisconnect.error.data.content[0] : null;
        if (filho?.tag) logger.info(`🧾 Detalhe do WhatsApp: <${filho.tag}${Object.entries(filho.attrs || {}).filter(([k]) => k !== "id").map(([k, v]) => ` ${k}="${v}"`).join("")}>`);
      } catch {}
      console.log(`${"─".repeat(50)}\n`);

      if (tipo === "connectionFailure405") {
        on405?.();
      }

      if (!deveReconectar) {
        await onFatal?.(tipo);

        if (deletarSessao && sessionsDir) {
          try {
            if (fs.existsSync(sessionsDir) && fs.readdirSync(sessionsDir).length) {
              const guardadas = path.join(path.dirname(sessionsDir), "sessoes-encerradas");
              fs.mkdirSync(guardadas, { recursive: true, mode: 0o700 });
              fs.renameSync(sessionsDir, path.join(guardadas, `sessao-${Date.now()}`));
              fs.mkdirSync(sessionsDir, { recursive: true, mode: 0o700 });
              const antigas = fs.readdirSync(guardadas).filter((n) => /^sessao-\d+$/.test(n)).sort();
              for (const n of antigas.slice(0, -3)) fs.rmSync(path.join(guardadas, n), { recursive: true, force: true });
              logger.warn("🗑️  Credenciais removidas da pasta ativa (sessão encerrada guardada à parte). Conecte o número de novo para voltar.");
            }
          } catch (rmErr) {
            logger.error(`Falha ao guardar a sessão encerrada: ${rmErr.message}`);
          }
        }

        logger.error("⛔ Reconexão não será tentada para este tipo de erro.");
        process.exit(1);
      }

      metrics.onReconectando();
      onReconnect?.();
    }
  });
}

