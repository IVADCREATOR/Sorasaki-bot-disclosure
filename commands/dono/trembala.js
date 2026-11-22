import CONFIG from "../../config.js";
import { lerDivulgacao, salvarDivulgacao } from "../../utils/arquivo.js";
import { reagendarCicloExterno } from "../../events/autodisparo.js";
import { lerHorarios, normalizarHorario, proximoHorario, quando, titulo } from "../../utils/sucessos.js";

const MAX_HORARIOS = 12;

export default {
  name: "trembala",
  nome: "anavilela",
  aliases: ["horarios", "horários", "agenda"],
  categoria: "dono",
  description: "Divulgação em horários fixos do dia (horário de Brasília), em vez de intervalo.",

  async execute({ sock, from, msg, args, isDono }) {
    if (!isDono) return;
    const p = CONFIG.bot.prefix;
    const responder = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const cabecalho = titulo("🚄", "Trem-Bala", "Ana Vilela");
    const acao = String(args[0] || "").toLowerCase();

    if (["off", "desligar", "limpar"].includes(acao)) {
      salvarDivulgacao({ horarios: [] });
      reagendarCicloExterno(sock);
      return responder(`Horários fixos desligados. A divulgação volta para o intervalo de ${lerDivulgacao().intervaloMinutos || 60} min.`);
    }

    if (args.length) {
      const lidos = args.join(" ").split(/[\s,;]+/).filter(Boolean).map(normalizarHorario);
      if (lidos.some((h) => !h)) return responder(`Não entendi algum horário. Use assim: ${p}trembala 09:00 12:30 18h 21h15`);
      const horarios = [...new Set(lidos)].sort().slice(0, MAX_HORARIOS);
      salvarDivulgacao({ horarios });
      reagendarCicloExterno(sock);
      const cfg = lerDivulgacao();
      const prox = proximoHorario(horarios);
      return responder(`${cabecalho}\n\nTrem-bala na linha 🚄 A divulgação sai todo dia às: *${horarios.join(", ")}* (Brasília).\nPróxima partida: ${quando(prox)}${cfg.status ? "" : `\n\n⚠️ A divulgação está desligada. Ligue com ${p}autoresponder on`}`);
    }

    const horarios = lerHorarios();
    return responder(`${cabecalho}

A vida passa rápido: o anúncio sai na hora certa, todo dia, nos horários que você escolher (Brasília). Enquanto houver horários, o intervalo do ${p}tempo fica pausado.

${horarios.length ? `Horários: *${horarios.join(", ")}*\nPróxima partida: ${quando(proximoHorario(horarios))}` : "Nenhum horário fixo. Agora vale o intervalo."}

${p}trembala 09:00 12:30 18h — define até ${MAX_HORARIOS} horários
${p}trembala off — volta para o intervalo
Dica: ${p}sinaisdefogo mostra o melhor horário dos seus grupos.`);
  }
};
