import CONFIG from "../../config.js";

export default {
  name: "menuauto",
  nome: "menudisparo",
  aliases: ["menu", "ajuda", "comandos"],
  categoria: "dono",
  livre: true,
  description: "Mostra os comandos da divulgação automática.",

  async execute({ sock, from, msg, isDono }) {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const text = `*${CONFIG.bot.name} • Divulgação automática*

*Mensagem*
${p}addtexto — escreva o texto logo depois do comando
${p}addfoto — envie (ou responda) uma imagem com o comando
${p}listext — mostra como a divulgação vai sair

*Envio*
${p}autoresponder on | off — liga ou desliga
${p}tempo 60 — intervalo entre envios, em minutos
${p}dispararagora — envia agora para os grupos

*Grupos*
${p}registrarlink <link> [nome] — o bot entra sozinho
${p}listalinks · ${p}rmlink <link>
${p}blockdivul — lista todos os grupos; bloqueie vários: ${p}blockdivul 1 3 5 (ou dentro do grupo, só ele)

*Acompanhar*
${p}statusdivul · ${p}statusrede

*🎶 Sucessos* (${p}sucessos explica cada um)
${p}eternamente · ${p}aquarela · ${p}sinaisdefogo · ${p}trembala
${p}exagerado · ${p}evidencias · ${p}maisumavez · ${p}tempoperdido

Prefere passo a passo? Mande *${p}divulgacao* aqui no privado.`;
    await sock.sendMessage(from, { text }, { quoted: msg });
  }
};
