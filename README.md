<p align="center">
  <img src="assets/banner.jpg" alt="Sorasaki Divulgação · Version Free" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-free-b18cff?style=for-the-badge&labelColor=0b0614">
  <img src="https://img.shields.io/badge/node-%3E%3D20-a259ff?style=for-the-badge&logo=node.js&logoColor=e3b8ff&labelColor=0b0614">
  <img src="https://img.shields.io/badge/baileys-atualizado-7b2cff?style=for-the-badge&logo=whatsapp&logoColor=e3b8ff&labelColor=0b0614">
  <img src="https://img.shields.io/badge/license-MIT-c79bff?style=for-the-badge&labelColor=0b0614">
</p>

<p align="center">
  <b>Divulgação automática nos grupos de WhatsApp</b>, com rodízio de textos, horários fixos,<br>
  comprovante de envio e respostas automáticas. Leve, estável e pronto para qualquer hospedagem.
</p>

<p align="center">
  <a href="#-hospedagens">Hospedagens</a> ·
  <a href="#-instalação">Instalação</a> ·
  <a href="#%EF%B8%8F-configuração">Configuração</a> ·
  <a href="#-comandos">Comandos</a> ·
  <a href="#-atualizações">Atualizações</a>
</p>

<p align="center"><img src="assets/neon/divisor.svg" width="100%"></p>

## ✨ Recursos

| | |
|---|---|
| 📣 **Divulgação automática** | Envia a cada X minutos ou em horários fixos, com texto e imagem |
| 🎯 **Grupos escolhidos** | Todos os grupos ou só os que você quiser, com bloqueio por grupo |
| 🚪 **Auto-entrada** | Entra sozinho em grupos pelo link de convite |
| 🔁 **Rodízio de textos** | Até 10 anúncios alternando a cada disparo |
| 🧾 **Comprovante** | Relatório do último envio para mandar ao cliente |
| 💬 **Respostas automáticas** | Palavra-chave, boas-vindas e horário de atendimento |
| 🛡️ **Estabilidade** | Reconexão automática, limpeza de cache e proteção da sessão |

<p align="center"><img src="assets/neon/divisor.svg" width="100%"></p>

## 🖥️ Hospedagens

| Hospedagem | Arquivo pronto | Como iniciar |
|---|---|---|
| ☁️ **Square Cloud** | `squarecloud.app` | Automático |
| ☁️ **Discloud** | `discloud.config` | Automático |
| 🖥️ **Bronxys, Pterodactyl e painéis** | `package.json` | `npm start` |
| 🐧 **VPS Linux** | `package.json` | `npm start` ou PM2 |
| 📱 **Termux** | `package.json` | `npm start` |
| 🪟 **Windows** | `package.json` | `npm start` |

> Requisitos: **Node.js 20 ou superior** e um número de WhatsApp só para o bot.

<p align="center"><img src="assets/neon/divisor.svg" width="100%"></p>

## 📦 Instalação

<details>
<summary><b>🐧 VPS Linux (Ubuntu / Debian)</b></summary>

```bash
apt update && apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
git clone https://github.com/IVADCREATOR/Sorasaki-bot-disclosure divulgacao
cd divulgacao
npm install
cp .env.exemplo .env && nano .env
npm start
```

Para deixar ligado 24h:
```bash
npm install -g pm2
pm2 start index.js --name divulgacao
pm2 save && pm2 startup
```
</details>

<details>
<summary><b>📱 Termux (Android)</b></summary>

```bash
pkg update && pkg install -y nodejs-lts git
git clone https://github.com/IVADCREATOR/Sorasaki-bot-disclosure divulgacao
cd divulgacao
npm install
cp .env.exemplo .env && nano .env
termux-wake-lock
npm start
```
Tire o Termux da otimização de bateria do Android.
</details>

<details>
<summary><b>☁️ Square Cloud</b></summary>

1. Faça um **Fork** deste repositório.
2. Crie a aplicação conectando ao seu fork (ou envie o `.zip` sem `node_modules`).
3. Em **Variáveis de ambiente**, adicione `BOT_PAIRING_NUMBER` e `BOT_OWNER_NUMBER`.
4. O código de pareamento aparece no **Console**.
</details>

<details>
<summary><b>☁️ Discloud</b></summary>

1. Compacte o projeto sem `node_modules` e envie pelo painel ou pelo bot da Discloud.
2. Defina `BOT_PAIRING_NUMBER` e `BOT_OWNER_NUMBER` nas variáveis (ou no `.env`).
3. O código de pareamento aparece nos **Logs**.
</details>

<details>
<summary><b>🖥️ Bronxys, Pterodactyl e outros painéis</b></summary>

- **Arquivo principal:** `index.js`
- **Comando de início:** `npm start`
- **Variáveis:** `BOT_PAIRING_NUMBER`, `BOT_OWNER_NUMBER` e `BOT_PAIRING_METHOD=code`
- Se o painel tiver **Git Repo Address**, use `https://github.com/IVADCREATOR/Sorasaki-bot-disclosure` e ligue o **Auto Update**.
</details>

<details>
<summary><b>🪟 Windows</b></summary>

1. Instale o **Node.js 20 LTS** em nodejs.org.
2. Baixe o projeto, abra a pasta e digite `cmd` na barra de endereço.
3. Rode `npm install`, copie `.env.exemplo` para `.env`, edite e rode `npm start`.
</details>

<p align="center"><img src="assets/neon/divisor.svg" width="100%"></p>

## ⚙️ Configuração

Tudo pode ser feito pelo `.env` ou pelas variáveis de ambiente da hospedagem:

| Variável | Para que serve | Exemplo |
|---|---|---|
| `BOT_PAIRING_NUMBER` | Número do bot (o chip pareado) | `5511987654321` |
| `BOT_OWNER_NUMBER` | Seu número: quem usa os comandos | `5511912345678` |
| `BOT_OWNER_NAME` | Seu nome nos menus | `Loja X` |
| `BOT_NAME` | Nome do bot | `Divulga Loja X` |
| `BOT_PAIRING_METHOD` | `code` (código) ou `qr` | `code` |
| `BOT_TZ` | Fuso dos horários | `America/Sao_Paulo` |

Números só com dígitos: país + DDD + número.

**Primeira conexão:** inicie o bot e use o código em **WhatsApp › Aparelhos conectados › Conectar com número de telefone**. A sessão fica salva e as próximas conexões são automáticas.

O próprio número do bot também é dono. Se o bot não te reconhecer, mande `#lid` no privado dele e coloque o resultado em `owner.lid` no `config.js`.

<p align="center"><img src="assets/neon/divisor.svg" width="100%"></p>

## 🚀 Comandos

Todos os comandos são do dono e vão no privado do bot. `#menu` mostra tudo.

| Comando | O que faz |
|---|---|
| `#addtexto TEXTO` | Define o texto da divulgação |
| `#addfoto` | Define a imagem (envie junto com a foto) |
| `#tempo 60` | Envia a cada 60 minutos |
| `#autoresponder on` | Liga a divulgação |
| `#listext` | Mostra como a divulgação vai sair |
| `#dispararagora` | Envia na hora |
| `#statusdivul` | Status da divulgação |
| `#statusrede` | Status da conexão |
| `#registrarlink LINK nome` | Entra no grupo pelo link |
| `#listalinks` · `#rmlink` | Lista e remove links |
| `#blockdivul` | Usado no grupo: para de receber |

**🎶 Sucessos** (`#sucessos` explica cada um)

| Código | O que faz |
|---|---|
| `#eternamente` | Rodízio de até 10 textos |
| `#aquarela` | Anúncio com o nome de cada grupo |
| `#sinaisdefogo` | Termômetro dos grupos e melhor horário |
| `#trembala` | Horários fixos: `#trembala 09:00 18:00` |
| `#exagerado` | Estilos de letra para o texto |
| `#evidencias` | Comprovante do último disparo |
| `#maisumavez` | Reenvia para quem não recebeu |
| `#tempoperdido` | Encontra grupos parados |

<details>
<summary><b>💬 Respostas automáticas</b></summary>

Crie `storage/respostas.json`:
```json
{
  "settings": { "enabled": true, "typing": true, "pause_after_owner_minutes": 30 },
  "rules": [
    { "id": "preco", "match_type": "contains", "patterns": ["preço", "valor"],
      "replies": ["{saudacao}, {nome}! O plano custa R$ 19,90."],
      "scope": "private", "delay_seconds": 2, "cooldown_minutes": 10, "quote": true }
  ]
}
```
- `match_type`: `exact`, `contains`, `similar`, `pattern`, `regex`, `welcome` ou `any`
- `scope`: `private`, `groups` ou `all`
</details>

<p align="center"><img src="assets/neon/divisor.svg" width="100%"></p>

## 🔄 Atualizações

> [!IMPORTANT]
> Este repositório recebe **somente atualizações do Baileys**, a biblioteca que conecta ao WhatsApp, para manter o bot funcionando quando o WhatsApp muda.
> **Não haverá novos sistemas ou comandos.** A versão free é entregue completa como está.

Atualizar **não apaga** sua sessão, configurações nem dados.

| Hospedagem | Como atualizar |
|---|---|
| 🐧 VPS · 📱 Termux · 🪟 Windows | `npm run atualizar` e depois `npm start` |
| 🖥️ Bronxys / Pterodactyl | Console: `npm run atualizar` · ou **Auto Update** ligado |
| ☁️ Square Cloud | No seu fork: **Sync fork › Update branch** |
| ☁️ Discloud | Baixe a versão nova e envie de novo, sem `QR-CODE/` e `storage/` |

<sub>`npm run atualizar` é o mesmo que `git pull --autostash origin main && npm install`.</sub>

📢 Os avisos de atualização saem no [canal da Sorasaki](https://whatsapp.com/channel/0029VbDgYzOL2AU7jRJrN304).

<p align="center"><img src="assets/neon/divisor.svg" width="100%"></p>

## ⚠️ Boas práticas

- Divulgue apenas em grupos onde o bot foi aceito, nunca no privado de quem não falou com o número.
- Use intervalos de **60 minutos ou mais**.
- Prefira um número com alguns dias de uso normal antes de virar bot.
- Remova os grupos que sempre falham com `#tempoperdido`.

<p align="center"><img src="assets/neon/divisor.svg" width="100%"></p>

## 📄 Licença

Distribuído sob a licença **MIT**. Veja o arquivo [LICENSE](LICENSE).

<p align="center"><img src="assets/neon/rodape.svg" width="100%"></p>
