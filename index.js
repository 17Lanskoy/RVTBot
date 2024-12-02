import {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  ChannelType,
  RoleManager,
} from 'discord.js';

// Создаем клиента
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Переменная для хранения количества людей с ролью контракта
let contractRoleCount = 0;

// ID каналов
const CHANNEL_TO_CLEAR_ID = '1185369940560183407';
const ANNOUNCEMENT_CHANNEL_ID = '1175587928878100633';
const LOG_CHANNEL_ID = '1241875480244916304'; // Обновленное значение

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const member = interaction.member;
  const guild = interaction.guild;

  switch (interaction.customId) {
    case 'book-contract':
      if (contractRoleCount >= 5) {
        await interaction.reply({ content: 'Контракт уже полностью забронирован.', ephemeral: true });
        break;
      }

      let role = guild.roles.cache.find(r => r.name === 'Contract Role');
      if (!role) {
        role = await createContractRole(guild);
        if (!role) {
          await interaction.reply({ content: 'Ошибка при создании роли.', ephemeral: true });
          break;
        }
      }

      if (member.roles.cache.some(r => r.name === 'Contract Role')) {
        await interaction.reply({ content: 'Вы уже забронировали контракт.', ephemeral: true });
        break;
      }

      member.roles.add(role);
      contractRoleCount++;

      await updateButtons(interaction.message, true, true);

      await addUserToList(member, interaction);

      await interaction.reply({ content: 'Вы успешно забронировали контракт!', ephemeral: true });
      break;

    case 'cancel-book':
      if (!member.roles.cache.some(r => r.name === 'Contract Role')) {
        await interaction.reply({ content: 'У вас нет брони на этот контракт.', ephemeral: true });
        break;
      }

      // Получаем роль контракта
      let cancelRole = member.roles.cache.find(r => r.name === 'Contract Role');

      member.roles.remove(cancelRole);
      contractRoleCount--;

      await removeUserFromList(member, interaction);

      await interaction.reply({ content: 'Вы успешно отменили бронь на контракт!', ephemeral: true });

      // Логируем отмену бронирования
      const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
      await logChannel.send(`${member.user.tag} отменил бронь на контракт.`);

      // Обновление кнопок
      await updateButtons(interaction.message, true, false); // Здесь можно оставить false, если кнопки завершения должны оставаться неактивными
      break;

    case 'finish-with-payment':
    case 'finish-without-payment':
      if (!member.roles.cache.some(r => r.name === 'Contract Role')) {
        await interaction.reply({ content: 'У вас нет брони на этот контракт.', ephemeral: true });
        break;
      }

      const finishChannel = guild.channels.cache.get(CHANNEL_TO_CLEAR_ID);
      await handleFinish(member, interaction.customId.includes('payment'), finishChannel);
      break;
  }
});

async function handleFinish(member, withPayment, channel) {
  const role = member.roles.cache.find(r => r.name === 'Contract Role');
  member.roles.remove(role);
  contractRoleCount--;

  const logMessage = `${member.toString()} завершил контракт${withPayment ? ' с выплатой' : ' без выплаты'}`;
  await channel.send(logMessage);

  const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  await logChannel.send(logMessage);
  
  // Логируем завершение контракта
  await logChannel.send(`Пользователь ${member.user.tag} завершил контракт. Текущее количество участников: ${contractRoleCount}.`);

  if (contractRoleCount === 0) {
    await clearChannel(channel);
    await channel.send('Контракт завершен, до следующего открытия 24 часа.');
    await deleteContractRole(role);
    
    // Логируем окончание контракта
    await logChannel.send('Контракт завершен. Все участники завершили выполнение.');
  }
}

async function clearChannel(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    await channel.bulkDelete(messages);
  } catch (err) {
    console.error(err);
  }
}

async function updateButtons(message, bookEnabled, finishEnabled) {
  const bookingStatus = `Забронировано: ${contractRoleCount}/5`;

  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('book-contract')
        .setLabel('Забронировать контракт')
        .setStyle(3), // Зеленая кнопка (аналог Success)
      new ButtonBuilder()
        .setCustomId('cancel-book')
        .setLabel('Отменить бронь')
        .setStyle(4), // Красная кнопка (аналог Danger)
    );

  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('finish-with-payment')
        .setLabel('Завершить (с выплатой)')
        .setStyle(1) // Синяя кнопка (аналог Primary)
        .setDisabled(!finishEnabled || contractRoleCount !== 5), // Активность зависит от параметра finishEnabled и наличия 5 человек с ролью контракта
      new ButtonBuilder()
        .setCustomId('finish-without-payment')
        .setLabel('Завершить (без выплаты)')
        .setStyle(2) // Серая кнопка (аналог Secondary)
        .setDisabled(!finishEnabled || contractRoleCount !== 5), // Активность зависит от параметra finishEnabled и наличия 5 человек с ролью контракта
    );

  await message.edit({ content: bookingStatus, components: [row1, row2] });
}

async function createContractRole(guild) {
  try {
    const role = await guild.roles.create({
      name: 'Contract Role',
      color: '#00FF00', // Зеленый цвет
      reason: 'Создана роль для контракта.',
    });
    console.log(`Роль контракта создана: ${role.name}`);
    return role;
  } catch (error) {
    console.error('Не удалось создать роль контракта:', error);
    return null;
  }
}

async function deleteContractRole(role) {
  try {
    await role.delete();
    console.log(`Роль контракта удалена: ${role.name}`);
  } catch (error) {
    console.error('Не удалось удалить роль контракта:', error);
  }
}

client.on('messageCreate', async message => {
  if (message.content.startsWith('!activate')) {
    // Проверяем наличие прав администратора у автора сообщения
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('У вас нет прав для выполнения этой команды.');
    }

    const channelToClear = message.guild.channels.cache.get(CHANNEL_TO_CLEAR_ID);
    const announcementChannel = message.guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);

    try {
      await clearChannel(channelToClear);

      // Отправляем сообщение в другой канал
      const embed = new EmbedBuilder()
        .setTitle('<@&1222777848323112991> *Контракт «Незаконное предприятие»*')
        .setDescription('\n' +
          '**Всем желающим, перейдите в канал https://discord.com/channels/1175587928190226462/1185369940560183407 и нажмите на кнопку «Забронировать».**')
        .setColor('#00FF00');

      await announcementChannel.send({ embeds: [embed] });

      // Создаем сообщение с кнопками
      const row1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('book-contract')
            .setLabel('Забронировать контракт')
            .setStyle(3) // Зеленая кнопка (аналог Success)
            .setDisabled(false),
          new ButtonBuilder()
            .setCustomId('cancel-book')
            .setLabel('Отменить бронь')
            .setStyle(4) // Красная кнопка (аналог Danger)
            .setDisabled(false)
        );

      const row2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('finish-with-payment')
            .setLabel('Завершить (с выплатой)')
            .setStyle(1) // Синяя кнопка (аналог Primary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('finish-without-payment')
            .setLabel('Завершить (без выплаты)')
            .setStyle(2) // Серая кнопка (аналог Secondary)
            .setDisabled(true)
        );

      await channelToClear.send({ content: 'Контракт открыт!', components: [row1, row2] });

      message.channel.send('Процесс активации запущен. Контракт открыт!');

      // Логируем активацию контракта
      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      await logChannel.send('Контракт был активирован администратором.');
    } catch (error) {
      console.error(error);
      message.channel.send('Произошла ошибка при активации процесса.');
    }
  }});

  async function addUserToList(member, interaction) {
    const listChannel = interaction.guild.channels.cache.get(CHANNEL_TO_CLEAR_ID);
  
    let listMessage = await listChannel.messages.fetch({ limit: 1 }).catch(() => []);
  
    if (listMessage.size > 0) {
      const firstMessage = listMessage.first();
      if (firstMessage.embeds.length > 0) {
        const oldEmbed = firstMessage.embeds[0];
        const description = oldEmbed.description.split('\n').map(l => l.trim()).join('\n');
        const newDescription = `${member.user.username}#${member.id}, \n${description}`;
  
        if (description.includes(newDescription)) {
          await interaction.followUp({
            content: 'Вы уже забронировали контракт!',
            ephemeral: true,
          });
          return;
        }
  
        const finalDescription = `${newDescription.slice(0, -2)}\n${description}`;
        const newEmbed = EmbedBuilder.from(oldEmbed).setDescription(finalDescription);
  
        await new Promise((100)).then(async () => {
          await interaction.followUp({
            content: 'Вы успешно добавили себя в список забронировавших.',
            ephemeral: true,
          });
        });
      } else {
        const initialEmbed = new EmbedBuilder()
          .setTitle('Список забронировавших:')
          .setDescription(`${member.user.username}#${member.id}\n`);
  
        await listChannel.send({ embeds: [initialEmbed] });
        await interaction.followUp({
          content: 'Вы стали первым в списке забронировавших.',
          ephemeral: true,
        });
      }
    } else {
      await interaction.followUp({
        content: 'Пока не было сообщения со списком забронировавших, поэтому вы первый.',
        ephemeral: true,
      });
    }
  }
  
  async function removeUserFromList(member, interaction) {
    const listChannel = interaction.guild.channels.cache.get(CHANNEL_TO_CLEAR_ID);
  
    let listMessage = await listChannel.messages.fetch({ limit: 1 }).catch(() => []);
    if (listMessage.size > 0) {
      const firstMessage = listMessage.first();
      if (firstMessage.embeds.length > 0) {
        const oldEmbed = firstMessage.embeds[0];
        const description = oldEmbed.description.split('\n').filter(l => l.trim());
        const filteredDescription = description.filter(d => d.includes(`${member.user.username}#${member.id}`));
  
        if (filteredDescription.length === 0) {
          await interaction.followUp({
            content: 'Вы не были в списке забронировавших.',
            ephemeral: true,
          });
          return;
        }
  
        const newDescription = filteredDescription.map(l => l.replace(`${member.user.username}#${member.id}`, ''));
        const newEmbed = EmbedBuilder.from(oldEmbed).setDescription(newDescription.join('\n'));
  
        await firstMessage.edit({ embeds: [newEmbed] });
        await interaction.followUp({
          content: 'Вы успешно убраны из списка забронировавших.',
          ephemeral: true,
        });
      } else {
        await interaction.followUp({
          content: 'Вы не были в списке забронировавших.',
          ephemeral: true,
        });
      }
    } else {
      await interaction.followUp({
        content: 'Вы не были в списке забронировавших.',
        ephemeral: true,
      });
    }
  }

client.login(''); // Вставьте сюда токен вашего бота