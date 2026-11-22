export default {
  name: "statusrede",
  nome: "statusrede",
  categoria: "dono",
  description: "Mostra a latência do WhatsApp e um resumo dos grupos.",

  execute: async ({ sock, from, msg, isDono }) => {
    if (!isDono) return;
    try {
      const inicio = Date.now();
      await sock.query({ tag: "iq", attrs: { id: sock.generateMessageTag(), to: "s.whatsapp.net", type: "get", xmlns: "w:p" }, content: [{ tag: "ping", attrs: {} }] });
      const ping = Date.now() - inicio;
      const grupos = Object.values(await sock.groupFetchAllParticipating());
      const eu = new Set([sock.user?.id, sock.user?.lid].filter(Boolean).map((j) => String(j).split(":")[0].split("@")[0]));
      let fechados = 0, admin = 0;
      for (const g of grupos) {
        if (g.announce === true || g.announce === "true") fechados++;
        const bot = (g.participants || []).find((p) => eu.has(String(p.id || "").split(":")[0].split("@")[0]));
        if (bot && (bot.admin === "admin" || bot.admin === "superadmin")) admin++;
      }
      const rss = Math.round(process.memoryUsage().rss / 1048576);
      await sock.sendMessage(from, {
        text: `*Conexão*\nLatência: ${ping} ms ${ping < 800 ? "(boa)" : ping < 2500 ? "(normal)" : "(lenta)"}\nMemória do bot: ${rss} MB\n\n*Grupos*\nTotal: ${grupos.length}\nAbertos: ${grupos.length - fechados} · Só admins falam: ${fechados}\nO bot é admin em: ${admin}`
      }, { quoted: msg });
    } catch (e) {
      console.error(`❌ [STATUSREDE] ${e.message}`);
      await sock.sendMessage(from, { text: "O WhatsApp demorou para responder. Tente de novo em instantes." }, { quoted: msg });
    }
  }
};
