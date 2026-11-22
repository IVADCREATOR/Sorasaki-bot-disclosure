import path from "path";
import CONFIG from "../../config.js";
import { lerJson } from "../../utils/arquivo.js";
import { forcarDisparoExterno, disparoEmAndamento } from "../../events/autodisparo.js";
import { lerEntrega, quando, titulo } from "../../utils/sucessos.js";

const ARQ_BLACKLIST = path.resolve("./storage/blacklist_grupos.json");

export default {
  name: "maisumavez",
  nome: "renatorusso",
  aliases: ["reenviar", "denovo", "repescagem"],
  categoria: "dono",
  description: "Reenvia a última divulgação só para os grupos que não receberam.",

  async execute({ sock, from, msg, isDono }) {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const responder = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const cabecalho = titulo("🔁", "Mais Uma Vez", "Renato Russo");
    const e = lerEntrega();
    if (!e) return responder(`${cabecalho}\n\nAinda não houve nenhum disparo para repetir. Para enviar agora: ${p}dispararagora`);
    const lista = lerJson(ARQ_BLACKLIST, []);
    const bloqueados = new Set((Array.isArray(lista) ? lista : []).map((id) => String(id).toLowerCase()));
    const alvo = [...new Set(e.falhas.map((g) => g.id))].filter((id) => !bloqueados.has(id.toLowerCase()));
    if (!alvo.length) return responder(`${cabecalho}\n\nNa divulgação de ${quando(e.at)} todos os grupos receberam ✅ Não falta ninguém.`);
    if (disparoEmAndamento()) return responder("Já tem uma divulgação saindo agora. Espere o relatório e tente de novo.");
    await responder(`${cabecalho}\n\nTentando de novo em ${alvo.length} grupo(s) que não receberam a divulgação de ${quando(e.at)}, com o mesmo texto. O relatório chega aqui no final.`);
    const r = await forcarDisparoExterno(sock, { somente: alvo, textoFixo: e.texto });
    if (r && !r.ok) await responder(`Não deu para reenviar: ${r.texto}.`);
  }
};
