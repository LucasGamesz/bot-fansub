const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const http = require('http');
const mongoose = require('mongoose');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// --- CONFIGURAÇÕES DISCORD ---
const GUILD_ID = '1559002627285590026';  
const PROGRESSO_CHANNEL_ID = '1559007169188331540'; // Canal padrão se não especificar um no comando

// --- MODELOS DO MONGODB ---
const obraSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  nomeOriginal: { type: String, required: true },
  tituloAlternativo: { type: String },
  generos: { type: String },
  estudios: { type: String },
  temporada: { type: String },
  status: { type: String },
  episodios: { type: String },
  sinopse: { type: String },
  downloads: { type: String },
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

// 1. Definição dos comandos de barra (com opções obrigatórias primeiro)
const commands = [
  new SlashCommandBuilder()
    .setName('cadastrar-obra')
    .setDescription('Cadastra ou atualiza uma obra e envia a ficha técnica no canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option => option.setName('titulo').setDescription('Título principal da obra').setRequired(true))
    .addStringOption(option => option.setName('generos').setDescription('Gêneros (ex: Action, Sci-Fi)').setRequired(true))
    .addStringOption(option => option.setName('estudios').setDescription('Estúdios responsáveis').setRequired(true))
    .addStringOption(option => option.setName('temporada').setDescription('Temporada e Ano (ex: Primavera/2024)').setRequired(true))
    .addStringOption(option => option.setName('status').setDescription('Status (ex: Finalizado, Em Lançamento)').setRequired(true))
    .addStringOption(option => option.setName('episodios').setDescription('Total de episódios').setRequired(true))
    .addStringOption(option => option.setName('sinopse').setDescription('Sinopse da obra').setRequired(true))
    .addStringOption(option => option.setName('downloads').setDescription('Links de download').setRequired(true))
    .addStringOption(option => option.setName('cor').setDescription('Cor em Hex (Ex: #FF0000 ou FF0000)').setRequired(true))
    .addStringOption(option => option.setName('imagem').setDescription('Link da imagem/capa').setRequired(true))
    // Opções opcionais no final
    .addChannelOption(option => 
      option.setName('canal')
        .setDescription('Canal onde a ficha técnica será enviada (opcional)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .addStringOption(option => option.setName('titulo_alternativo').setDescription('Título alternativo').setRequired(false)),

  new SlashCommandBuilder()
    .setName('progresso')
    .setDescription('Atualiza o progresso de um episódio (puxa cor e imagem da obra cadastrada)')
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
});

const nomesEtapas = {
  tl: 'TL (Tradução)',
  ed: 'ED (Edição)',
  ts: 'TS (Typesetting)',
  qc: 'QC (Revisão)'
};

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // --- /CADASTRAR-OBRA ---
  if (interaction.commandName === 'cadastrar-obra') {
    const titulo = interaction.options.getString('titulo');
    const generos = interaction.options.getString('generos');
    const estudios = interaction.options.getString('estudios');
    const temporada = interaction.options.getString('temporada');
    const status = interaction.options.getString('status');
    const episodios = interaction.options.getString('episodios');
    const sinopse = interaction.options.getString('sinopse');
    const downloads = interaction.options.getString('downloads');
    const corInput = interaction.options.getString('cor');
    const imagem = interaction.options.getString('imagem');
    const canalAlvo = interaction.options.getChannel('canal');
    const tituloAlternativo = interaction.options.getString('titulo_alternativo') || '';

    const cleanHex = corInput.replace('#', '');
    if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
      return interaction.reply({ content: '❌ Cor inválida! Use o formato hexadecimal correto (Ex: `#FF0000` ou `FF0000`).', ephemeral: true });
    }

    const key = titulo.toLowerCase();

    const obraData = {
      key,
      nomeOriginal: titulo,
      tituloAlternativo,
      generos,
      estudios,
      temporada,
      status,
      episodios,
      sinopse,
      downloads,
      imagem,
      cor: cleanHex
    };

    // Atualiza se já existir ou cria novo no MongoDB Atlas
    const obraExistente = await Obra.findOne({ key });
    await Obra.findOneAndUpdate({ key }, obraData, { upsert: true, new: true });

    // Montar o Embed da Ficha Técnica
    const embedFicha = new EmbedBuilder()
      .setColor(parseInt(cleanHex, 16))
      .setDescription(`# ${titulo}`) // Título H1 enorme no topo
      .setThumbnail(imagem)
      .addFields(
        // { name: '📺 Título', value: titulo, inline: false },
        ...(tituloAlternativo ? [{ name: '📺 Título Alternativo', value: tituloAlternativo, inline: false }] : []),
        { name: '🎭 Gêneros', value: generos, inline: true },
        { name: '🎨 Estúdio(s)', value: estudios, inline: true },
        { name: '📅 Temporada/Ano', value: temporada, inline: true },
        { name: '📊 Status', value: status, inline: true },
        { name: '🎬 Episódios Totais', value: episodios, inline: true },
        { name: '📖 SINOPSE', value: sinopse, inline: false },
        { name: '📦 DOWNLOADS', value: downloads, inline: false }
      )
      .setTimestamp();

    // Define qual canal usar: o especificado na opção ou o canal padrão hardcoded
    let canalDestino = canalAlvo;
    if (!canalDestino) {
      canalDestino = await client.channels.fetch(PROGRESSO_CHANNEL_ID).catch(() => null);
    }

    if (canalDestino) {
      await canalDestino.send({ embeds: [embedFicha] });
      const acao = obraExistente ? 'atualizada e reenviada' : 'cadastrada e enviada';
      return interaction.reply({ content: `✅ Ficha técnica de **"${titulo}"** ${acao} com sucesso no canal ${canalDestino}!`, ephemeral: true });
    } else {
      return interaction.reply({ content: '❌ Não foi possível encontrar o canal para enviar a mensagem.', ephemeral: true });
    }
  }

  // --- /PROGRESSO ---
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

    let descricao = `# ${nomeExibicao}\n### Episódio ${ep} - ${porcentagem}%`;

    if (etapaConcluidaRecente) {
      descricao += `\n\n✅ **${etapaConcluidaRecente}**\n${tlStatus}  ${edStatus}  ${tsStatus}  ${qcStatus}`;
    } else {
      descricao += `\n\n${tlStatus}  ${edStatus}  ${tsStatus}  ${qcStatus}`;
    }

    const embedProgresso = new EmbedBuilder()
      .setColor(corObra)
      .setDescription(descricao)
      .setTimestamp();

    if (imagemObra) {
      embedProgresso.setThumbnail(imagemObra);
    }

    const canalProgresso = await client.channels.fetch(PROGRESSO_CHANNEL_ID);
    if (canalProgresso) {
      await canalProgresso.send({ embeds: [embedProgresso] });
      await interaction.reply({ content: `✅ Progresso de **${nomeExibicao} (Ep. ${ep})** enviado com sucesso!`, ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ Canal de progresso não encontrado.', ephemeral: true });
    }
  }
});

// --- MINI SERVIDOR HTTP ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot esta online e operando!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor HTTP rodando na porta ${PORT}`);
});

client.login(process.env.TOKEN);
