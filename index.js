import "dotenv/config";
import "./utils/fuso.js";
import start, { encerrarSock } from "./start.js";
import logger from "./utils/logger.js";

const interceptarSaida = (stream) => {
  const originalWrite = stream.write;
  stream.write = function (chunk, encoding, callback) {
    const texto = chunk ? chunk.toString() : "";
    if (
      texto.includes("Closing session:") ||
      texto.includes("Closing open session") ||
      texto.includes("prekey bundle") ||
      texto.includes("SessionEntry") ||
      texto.includes("PendingPreKey") ||
      texto.includes("MessageCounterError") ||
      texto.includes("Failed to decrypt message") ||
      texto.includes("session_cipher.js")
    ) {
      if (typeof callback === "function") callback();
      return true;
    }
    return originalWrite.call(stream, chunk, encoding, callback);
  };
};

interceptarSaida(process.stdout);
interceptarSaida(process.stderr);

let encerrando = false;

async function initialize() {
  try {
    logger.warn("🚀 Iniciando núcleos do sistema e preparando conexão...");
    await start();
  } catch (error) {
    logger.error("🛑 Falha crítica ao iniciar o ecossistema:");
    logger.error(error?.stack || error);
    process.exit(1);
  }
}

process.on("uncaughtException", (error) => {
  if (
    error?.message?.includes("Bad MAC") ||
    error?.message?.includes("decrypt") ||
    error?.stack?.includes("libsignal")
  ) {
    logger.warn("⚠️ [Crypto-Ignore]: Ignorando erro de descriptografia de mensagem antiga da fila.");
    return;
  }

  logger.error("🚨 Erro Crítico Não Tratado (uncaughtException):");
  logger.error(error?.stack || error);

  if (!error?.message?.includes("EPIPE") && !error?.message?.includes("WebSocket")) {
    handleGracefulShutdown("uncaughtException", 1);
  }
});

process.on("unhandledRejection", (reason) => {
  const errorStr = String(reason?.stack || reason);
  if (errorStr.includes("Bad MAC") || errorStr.includes("decrypt")) {
    logger.warn("⚠️ [Crypto-Ignore]: Rejeição de criptografia antiga suprimida.");
    return;
  }
  logger.error("⚠️ Promise Rejeitada detectada (unhandledRejection):");
  logger.error(reason?.stack || reason);
});

async function handleGracefulShutdown(signal, codigoSaida = 0) {
  if (encerrando) return;
  encerrando = true;

  logger.warn(`\n🛑 Sinal [${signal}] recebido. Desligando Sorasaki Autodisparo...`);

  try {
    logger.info("🔌 Encerrando sessão do WebSocket de forma limpa...");
    await encerrarSock();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (e) {
    logger.warn(`⚠️ Erro ao encerrar sessão: ${e?.message || e}`);
  }

  logger.warn("💾 Salvando dados residuais e fechando logs...");
  logger.success("👋 Sistema encerrado com segurança. Até mais!");
  process.exit(codigoSaida);
}

process.on("SIGINT",  () => handleGracefulShutdown("SIGINT"));
process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));

initialize();
