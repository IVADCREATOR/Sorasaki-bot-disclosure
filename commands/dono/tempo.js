import CONFIG from "../../config.js";
import { salvarDivulgacao } from "../../utils/arquivo.js";
import { reagendarCicloExterno } from "../../events/autodisparo.js";

export default {
  name: "tempo",
  nome: "tempo",
  categoria: "dono",
  description: "Altera o intervalo entre as divulgações automáticas.",

  async execute({ sock, from, msg, args, isDono }) {
    if (!isDono) return;
    const minutos = parseInt(args[0], 10);
    if (!Number.isInteger(minutos) || minutos < 1 || minutos > 10080) {
      return sock.sendMessage(from, { text: `Informe o intervalo em minutos (de 1 a 10080). Exemplo: ${CONFIG.bot.prefix}tempo 60` }, { quoted: msg });
    }
    try {
      salvarDivulgacao({ intervaloMinutos: minutos, agendaDesde: Date.now() });
      reagendarCicloExterno(sock);
      const legivel = minutos >= 60 && minutos % 60 === 0 ? `${minutos / 60} h` : `${minutos} min`;
      await sock.sendMessage(from, { text: `Pronto ✅ A divulgação agora sai a cada ${legivel}. O cronômetro recomeçou agora.` }, { quoted: msg });
    } catch (e) {
      console.error(`❌ [TEMPO] ${e.message}`);
      await sock.sendMessage(from, { text: "Não consegui salvar o novo intervalo. Tente de novo em instantes." }, { quoted: msg });
    }
  }
};
