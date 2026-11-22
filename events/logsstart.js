
import { limparTela } from "../utils/logger.js";

export function logBootInicio() {
  limparTela();
  console.log("\n  ╔══════════════════════════════════════════╗");
  console.log("  ║     🚀  SORASAKI SYSTEM INICIANDO...     ║");
  console.log("  ╚══════════════════════════════════════════╝\n");
}

export function logBootComandosCarregados(total) {
  console.log(`  📦 ${total} comando(s) carregado(s) com sucesso`);
  console.log("  🔗 Aguardando handshake da rede WhatsApp...\n");
}

export function logErroCritico(mensagem) {
  console.error(`\n  💥 Erro crítico na inicialização: ${mensagem}\n`);
}

export function logMenuLogin() {
  limparTela();
  console.log("\n  ╔══════════════════════════════════════════╗");
  console.log("  ║       🔮  SORASAKI LOGIN SYSTEM  🔮       ║");
  console.log("  ╠══════════════════════════════════════════╣");
  console.log("  ║  [1] 🔑  Código de pareamento            ║");
  console.log("  ║  [2] 📷  QR Code no terminal             ║");
  console.log("  ║  [3] 🚪  Encerrar                        ║");
  console.log("  ╚══════════════════════════════════════════╝");
  console.log("\n  👉 Digite sua escolha e pressione ENTER:\n");
}

export function logQRCode(qrAscii) {
  limparTela();
  console.log("\n  ╔══════════════════════════════════════════╗");
  console.log("  ║        🔮  SORASAKI QR LOGIN  🔮         ║");
  console.log("  ║   Escaneie o QR Code com seu WhatsApp    ║");
  console.log("  ╚══════════════════════════════════════════╝\n");
  console.log(qrAscii);
  console.log("\n  ╔══════════════════════════════════════════╗");
  console.log("  ║  📱 WhatsApp → Aparelhos Conectados      ║");
  console.log("  ║  → Conectar um aparelho → Escanear QR    ║");
  console.log("  ║                                          ║");
  console.log("  ║  ⏳ QR expira em ~20 segundos            ║");
  console.log("  ║  🔄 Novo QR gerado automaticamente       ║");
  console.log("  ╚══════════════════════════════════════════╝\n");
}

export function logPareamentoAtivo() {
  limparTela();
  console.log("\n  ╔══════════════════════════════════════════╗");
  console.log("  ║     🔑  CÓDIGO DE PAREAMENTO ATIVO  🔑   ║");
  console.log("  ╚══════════════════════════════════════════╝");
  console.log("\n  📱 Digite o número com DDD + código do país");
  console.log("  Exemplo: 5511999999999\n");
}

export function logPareamentoCodigo(code) {
  limparTela();
  console.log("\n  ╔══════════════════════════════════════════╗");
  console.log("  ║       🔑  SEU CÓDIGO DE PAREAMENTO       ║");
  console.log("  ╠══════════════════════════════════════════╣");
  console.log(`  ║           👉   ${code}   👈              ║`);
  console.log("  ╠══════════════════════════════════════════╣");
  console.log("  ║  WhatsApp → Config → Aparelhos           ║");
  console.log("  ║  → Conectar aparelho → Código            ║");
  console.log("  ╚══════════════════════════════════════════╝\n");
}

export function logPareamentoErro(mensagem) {
  console.error(`\n  💥 Erro ao solicitar código: ${mensagem}\n`);
}

export function logConexaoAberta() {
  console.log("\n  ✅ Sorasaki conectado ao WhatsApp com sucesso!\n");
}

export function logLogout() {
  console.log("\n  🚪 O WhatsApp encerrou a sessão deste bot. Conecte o número de novo para voltar.\n");
}

export function logConflitoSessao() {
  console.log("\n  ╔══════════════════════════════════════════╗");
  console.log("  ║   ⚠️   CONFLITO DE SESSÃO DETECTADO   ⚠️  ║");
  console.log("  ╠══════════════════════════════════════════╣");
  console.log("  ║  Código 440 — outra sessão está ativa    ║");
  console.log("  ║  com as mesmas credenciais.              ║");
  console.log("  ║                                          ║");
  console.log("  ║  Causas comuns:                          ║");
  console.log("  ║  • Outro processo do bot já rodando      ║");
  console.log("  ║  • WhatsApp Web aberto no navegador      ║");
  console.log("  ║  • PM2/gerenciador reiniciou em duplicata║");
  console.log("  ║                                          ║");
  console.log("  ║  ✅ Feche todas as outras instâncias e   ║");
  console.log("  ║     rode o bot novamente.                ║");
  console.log("  ╚══════════════════════════════════════════╝\n");
}

export function logReconectando(tentativa, max, delaySegundos) {
  console.log(`\n  🔄 Reconectando... tentativa ${tentativa}/${max} (aguardando ${delaySegundos}s)\n`);
}

export function logReconectandoContinuo(tentativa, delaySegundos) {
  console.log(`\n  🔄 Ainda sem conexão (tentativa ${tentativa}). Continuo tentando sozinho a cada ${delaySegundos}s, sem desistir.\n`);
}

export function logMaxTentativasAtingido() {
  console.warn("\n  ⏳ Já tentei bastante e ainda não voltou. Não vou desistir: continuo tentando de 60 em 60 segundos em segundo plano, sem precisar reiniciar manualmente.\n");
}

export function logEncerrando() {
  console.log("\n  🛑 Encerrando Sorasaki com segurança...\n");
}

export default {
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
};