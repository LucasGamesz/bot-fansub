const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const http = require('http');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// --- CONFIGURAÇÕES DO YOUTUBE E DISCORD ---
const YOUTUBE_CHANNEL_ID = 'UCtmm6eThoXGDYuelQBWphoA';
const TRAILERS_CHANNEL_ID = '1559006817470910464';
const ANISONGS_CHANNEL_ID = '1559006593084035242';

// Insira aqui o ID do seu servidor do Discord para o comando aparecer instantaneamente:
const GUILD_ID = '1559002627285590026'; 

let lastVideoId = null;

// 1. Definição do comando /progresso
const commands = [
  new SlashCommandBuilder()
    .setName('progresso')
    .setDescription('Atualiza o progresso de um episódio da fansub')
    .addStringOption(option => 
      option.setName('obra').setDescription('Nome do anime/obra').setRequired(true))
    .addIntegerOption(option => 
      option.setName('episodio').setDescription('Número do episódio').setRequired(true))
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
    // Registra o comando especificamente no servidor (Guild) para aparecer na hora
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log('Comandos de barra registrados no servidor!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }

  // Iniciar verificação do YouTube (roda a cada 5 minutos)
  setInterval(checkYouTubeChannel, 300000);
  checkYouTubeChannel(); // Roda uma vez logo ao iniciar
});

// Função que verifica novos vídeos no YouTube usando a API rss2json
async function checkYouTubeChannel() {
  try {
    const rssUrl = encodeURIComponent(`https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`);
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`);
    const data = await response.json();

    if (data.status !== 'ok' || !data.items || data.items.length === 0) return;

    const latestVideo = data.items[0];
    const videoId = latestVideo.guid || latestVideo.link;

    // Na primeira leitura, apenas armazena para não spammar vídeos antigos ao ligar o bot
    if (lastVideoId === null) {
      lastVideoId = videoId;
      return;
    }

    // Se houver um vídeo novo
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

// 2. Manipulador do comando /progresso
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'progresso') {
    const obra = interaction.options.getString('obra');
    const ep = interaction.options.getInteger('episodio');
    
    const tlStatus = interaction.options.getString('tl') === 'done' ? '~~TL~~' : '**TL**';
    const edStatus = interaction.options.getString('ed') === 'done' ? '~~ED~~' : '**ED**';
    const tsStatus = interaction.options.getString('ts') === 'done' ? '~~TS~~' : '**TS**';
    const qcStatus = interaction.options.getString('qc') === 'done' ? '~~QC~~' : '**QC**';

    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle(`${obra}`)
      .setDescription(`Episódio ${ep} - Em andamento`)
      .addFields(
        { name: 'Status das Etapas', value: `${tlStatus} ${edStatus} ${tsStatus} ${qcStatus}` }
      )
      .setTimestamp();

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
