import CONFIG from "../../config.js";
import { lerDivulgacao, salvarDivulgacao } from "../../utils/arquivo.js";
import { calor, melhoresHoras, termometroDesde, ultimaMensagem, quando, titulo } from "../../utils/sucessos.js";

const barra = (v, max) => "🔥".repeat(Math.max(1, Math.round((v / Math.max(1, max)) * 5)));
const faixa = (h) => `${String(h).padStart(2, "0")}h–${String((h + 1) % 24).padStart(2, "0")}h`;

export default {
  name: "sinaisdefogo",
  nome: "pretagil",
  aliases: ["sinais", "termometro", "termômetro", "fogo"],
  categoria: "dono",
  description: "Termômetro dos grupos: os mais quentes, os mais frios e o melhor horário para divulgar.",

  async execute({ sock, from, msg, args, isDono }) {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const responder = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const acao = String(args[0] || "").toLowerCase();
    const cabecalho = titulo("🔥", "Sinais de Fogo", "Preta Gil");

    if (["on", "ligar"].includes(acao)) {
      salvarDivulgacao({ sinaisDeFogo: true });
      return responder(`${cabecalho}\n\nModo fogo ligado 🔥 Em cada disparo, os grupos mais quentes recebem primeiro, enquanto a conversa está rolando.`);
    }
    if (["off", "desligar"].includes(acao)) {
      salvarDivulgacao({ sinaisDeFogo: false });
      return responder("Modo fogo desligado. Os grupos recebem na ordem normal.");
    }

    let grupos = [];
    try { grupos = Object.values(await sock.groupFetchAllParticipating()); }
    catch { return responder("Não consegui listar os grupos agora. Tente de novo em instantes."); }
    if (!grupos.length) return responder("O bot ainda não está em nenhum grupo.");

    const medidos = grupos.map((g) => ({ nome: g.subject || "Grupo sem nome", v: calor(g.id), ultima: ultimaMensagem(g.id) })).sort((a, b) => b.v - a.v);
    const quentes = medidos.filter((g) => g.v > 0).slice(0, 10);
    const frios = medidos.filter((g) => g.v === 0).slice(0, 5);
    const max = quentes[0]?.v || 1;
    const horas = melhoresHoras(3);
    const dias = Math.max(0, (Date.now() - termometroDesde()) / 86_400_000);
    const cfg = lerDivulgacao();

    const linhas = [cabecalho, "", `Mensagens dos últimos 7 dias, medidas desde ${quando(termometroDesde())}.`];
    if (dias < 1) linhas.push("_O termômetro ainda está aprendendo: com 1 dia de conversa os sinais ficam bem mais certeiros._");
    linhas.push("", "*Mais quentes*");
    linhas.push(...(quentes.length ? quentes.map((g, i) => `${i + 1}. ${barra(g.v, max)} ${g.nome} · ${g.v} msg`) : ["_Nenhum grupo conversou desde que o termômetro ligou._"]));
    if (frios.length) linhas.push("", "*Sem sinal de fogo* 🧊", ...frios.map((g) => `• ${g.nome}${g.ultima ? ` · última conversa ${quando(g.ultima)}` : ""}`));
    linhas.push("", "*Melhor horário para divulgar*", horas.length ? horas.map((h, i) => `${["🥇", "🥈", "🥉"][i]} ${faixa(h)}`).join("\n") : "_Ainda sem dados._");
    if (horas.length) linhas.push(`Dica: ${p}trembala ${horas.map((h) => `${String(h).padStart(2, "0")}:00`).join(" ")}`);
    linhas.push("", `Modo fogo: ${cfg.sinaisDeFogo ? "ligado 🔥 (quentes recebem primeiro)" : "desligado"}`, `${p}sinaisdefogo on | off`);
    return responder(linhas.join("\n"));
  }
};
