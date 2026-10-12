const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const http = require('http');
const mongoose = require('mongoose');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// --- CONFIGURAÇÕES DO YOUTUBE E DISCORD ---
const YOUTUBE_CHANNEL_ID = 'UCtmm6eThoXGDYuelQBWphoA';
const TRAILERS_CHANNEL_ID = '1559006817470910464';
const ANISONGS_CHANNEL_ID = '1559006593084035242';
const GUILD_ID = '1559002627285590026';  

let lastVideoId = null;

// --- MODELOS DO MONGODB ---
const obraSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  nomeOriginal: { type: String, required: true },
  imagem: { type: String, required: true },
  cor: { type: String, required: true }
});

const historicoSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  tl: { type: String, default: 'pending' },
  ed: { type: String, default: 'pending' },
  ts: { type: String, default: 'pending' },
  qc: { type: String, default: 'pending' }
});

const Obra = mongoose.model('Obra', obraSchema);
const Historico = mongoose.model('Historico', historicoSchema);

// --- CONEXÃO AO MONGODB ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Conectado ao MongoDB com sucesso!'))
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// 1. Definição dos comandos de barra (/cadastrar-obra e /progresso)
const commands = [
  new SlashCommandBuilder()
    .setName('cadastrar-obra')
    .setDescription('Cadastra uma obra com imagem e cor padrão para usar no progresso')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option => 
      option.setName('nome').setDescription('Nome da obra').setRequired(true))
    .addStringOption(option => 
      option.setName('imagem').setDescription('Link da imagem/capa da obra').setRequired(true))
    .addStringOption(option => 
      option.setName('cor').setDescription('Cor do embed em Hex (Ex: #FF0000 ou FF0000)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('progresso')
    .setDescription('Atualiza o progresso de um episódio da fansub')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option => 
      option.setName('obra').setDescription('Nome exato da obra cadastrada').setRequired(true))
    .addIntegerOption(option => 
      option.setName('episodio').setDescription('Número do episódio').setRequired(true))
    .addIntegerOption(option => 
      option.setName('porcentagem').setDescription('Porcentagem concluída (0 a 100)').setRequired(true))
    .addStringOption(option =>
      option.setName('tl').setDescription('Tradução').setRequired(true).addChoices(
        { name: 'Feito (Riscar)', value: 'done' }, { name: 'Pendente (Negrito)', value: 'pending' }))
    .addStringOption(option =>
      option.setName('ed').setDescription('Edição').setRequired(true).addChoices(
        { name: 'Feito (Riscar)', value: 'done' }, { name: 'Pendente (Negrito)', value: 'pending' }))
    .addStringOption(option =>
      option.setName('ts').setDescription('Typesetting').setRequired(true).addChoices(
        { name: 'Feito (Riscar)', value: 'done' }, { name: 'Pendente (Negrito)', value: 'pending' }))
    .addStringOption(option =>
      option.setName('qc').setDescription('Revisão (QC)').setRequired(true).addChoices(
        { name: 'Feito (Riscar)', value: 'done' }, { name: 'Pendente (Negrito)', value: 'pending' }))
].map(command => command.toJSON());

client.once('ready', async () => {
  console.log(`Bot online como ${client.user.tag}!`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log('Comandos de barra limpos e registrados com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }

  setInterval(checkYouTubeChannel, 300000);
  checkYouTubeChannel();
});

// Função que verifica novos vídeos no YouTube
async function checkYouTubeChannel() {
  try {
    const rssUrl = encodeURIComponent(`https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`);
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`);
    const data = await response.json();

    if (data.status !== 'ok' || !data.items || data.items.length === 0) return;

    const latestVideo = data.items[0];
    const videoId = latestVideo.guid || latestVideo.link;

    if (lastVideoId === null) {
      lastVideoId = videoId;
      return;
    }

    if (videoId !== lastVideoId) {
      lastVideoId = videoId;
      const title = latestVideo.title;
      const url = latestVideo.link;

      const lowerTitle = title.toLowerCase();
      const isTrailerOrTeaser = lowerTitle.includes('trailer') || lowerTitle.includes('teaser');

      if (isTrailerOrTeaser) {
        const channel = await client.channels.fetch(TRAILERS_CHANNEL_ID);
        if (channel) {
          await channel.send(`## 🎬 ${title}\n🔗 Link: ${url}\n\n<@&1559016026803540009>`);
        }
      } else {
        const channel = await client.channels.fetch(ANISONGS_CHANNEL_ID);
        if (channel) {
          await channel.send(`## 🎵 ${title}\n🔗 Link: ${url}\n\n<@&1559015547914686636>`);
        }
      }
    }
  } catch (error) {
    console.error('Erro ao buscar feed do YouTube:', error);
  }
}

// Nomes formatados para exibição das etapas
const nomesEtapas = {
  tl: 'TL (Tradução)',
  ed: 'ED (Edição)',
  ts: 'TS (Typesetting)',
  qc: 'QC (Revisão)'
};

// Manipulador das interações (Comandos)
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Comando /cadastrar-obra
  if (interaction.commandName === 'cadastrar-obra') {
    const nome = interaction.options.getString('nome');
    const imagem = interaction.options.getString('imagem');
    const corInput = interaction.options.getString('cor');

    const cleanHex = corInput.replace('#', '');
    if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
      return interaction.reply({ content: '❌ Cor inválida! Use o formato hexadecimal correto (Ex: `#FF0000` ou `FF0000`).', ephemeral: true });
    }

    const key = nome.toLowerCase();

    await Obra.findOneAndUpdate(
      { key },
      { key, nomeOriginal: nome, imagem, cor: cleanHex },
      { upsert: true, new: true }
    );

    return interaction.reply({ content: `✅ Obra **"${nome}"** cadastrada com sucesso no banco de dados!`, ephemeral: true });
  }

  // Comando /progresso
  if (interaction.commandName === 'progresso') {
    const nomeObraInput = interaction.options.getString('obra');
    const ep = interaction.options.getInteger('episodio');
    const porcentagem = interaction.options.getInteger('porcentagem');

    const statusAtuais = {
      tl: interaction.options.getString('tl'),
      ed: interaction.options.getString('ed'),
      ts: interaction.options.getString('ts'),
      qc: interaction.options.getString('qc')
    };

    const obraKey = nomeObraInput.toLowerCase();
    const chaveHistorico = `${obraKey}_ep_${ep}`;

    let ultimoEstado = await Historico.findOne({ key: chaveHistorico });
    if (!ultimoEstado) {
      ultimoEstado = { tl: 'pending', ed: 'pending', ts: 'pending', qc: 'pending' };
    }

    let etapaConcluidaRecente = null;
    for (const [etapa, val] of Object.entries(statusAtuais)) {
      if (val === 'done' && ultimoEstado[etapa] === 'pending') {
        etapaConcluidaRecente = nomesEtapas[etapa];
        break;
      }
    }

    await Historico.findOneAndUpdate(
      { key: chaveHistorico },
      { key: chaveHistorico, ...statusAtuais },
      { upsert: true, new: true }
    );

    const tlStatus = statusAtuais.tl === 'done' ? '~~TL~~' : '**TL**';
    const edStatus = statusAtuais.ed === 'done' ? '~~ED~~' : '**ED**';
    const tsStatus = statusAtuais.ts === 'done' ? '~~TS~~' : '**TS**';
    const qcStatus = statusAtuais.qc === 'done' ? '~~QC~~' : '**QC**';

    const obraCadastrada = await Obra.findOne({ key: obraKey });

    const nomeExibicao = obraCadastrada ? obraCadastrada.nomeOriginal : nomeObraInput;
    const imagemObra = obraCadastrada ? obraCadastrada.imagem : null;
    const corObra = obraCadastrada ? parseInt(obraCadastrada.cor, 16) : 0x00AE86;

    const descricao = `# ${nomeExibicao}\n### Episódio ${ep} - ${porcentagem}%`;

    // Montar o valor do Field coladinho (com apenas uma quebra simples se houver check)
    let fieldValor = '';
    if (etapaConcluidaRecente) {
      fieldValor += `✅ **${etapaConcluidaRecente}**\n`;
    }
    fieldValor += `${tlStatus}  ${edStatus}  ${tsStatus}  ${qcStatus}`;

    const embed = new EmbedBuilder()
      .setColor(corObra)
      .setDescription(descricao)
      .addFields({ name: '\u200b', value: fieldValor })
      .setTimestamp();

    if (imagemObra) {
      embed.setThumbnail(imagemObra);
    }

    await interaction.reply({ embeds: [embed] });
  }
});

// --- MINI SERVIDOR HTTP PARA O RENDER NÃO DORMIR ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot esta online e operando!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor HTTP rodando na porta ${PORT}`);
});

client.login(process.env.TOKEN);
