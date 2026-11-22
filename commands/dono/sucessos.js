import CONFIG from "../../config.js";
import { lerDivulgacao } from "../../utils/arquivo.js";
import { lerRodizio, lerHorarios, negritoItalico } from "../../utils/sucessos.js";

export default {
  name: "sucessos",
  nome: "musicas",
  aliases: ["músicas", "hits", "playlist"],
  categoria: "dono",
  description: "Os códigos com nome de música famosa.",

  async execute({ sock, from, msg, isDono }) {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const cfg = lerDivulgacao();
    const r = lerRodizio(cfg);
    const liga = (v) => (v ? "🟢" : "⚪");
    const text = `🎶 *${negritoItalico("SUCESSOS DO AUTODISPARO")}* 🎶
_Cada código tem nome de música famosa._

${liga(r.ativo)} 💜 *${p}eternamente* — _Eternamente de Gal Gosta_
Rodízio eterno: seus textos se revezam, um por disparo.

${liga(cfg.aquarela)} 🎨 *${p}aquarela* — _Toquinho_
Cada grupo recebe o anúncio com o próprio nome e variações.

${liga(cfg.sinaisDeFogo)} 🔥 *${p}sinaisdefogo* — _Preta Gil_
Termômetro: grupos mais quentes, mais frios e o melhor horário.

${liga(lerHorarios(cfg).length)} 🚄 *${p}trembala* — _Ana Vilela_
Divulgação em horários fixos do dia.

🤯 *${p}exagerado* — _Cazuza_
3 estilos de letra exagerados, prontos para usar.

🧾 *${p}evidencias* — _Chitãozinho & Xororó_
Comprovante do disparo: grupos, alcance e horário (até em .txt).

🔁 *${p}maisumavez* — _Renato Russo_
Reenvia só para os grupos que não receberam.

⌛ *${p}tempoperdido* — _Legião Urbana_
Acha grupos parados ou que sempre falham, e faz a faxina.

🟢 = ligado agora`;
    await sock.sendMessage(from, { text }, { quoted: msg });
  }
};
