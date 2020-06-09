import { DiscordBot } from './discord'
import { TelegramBot } from './telegram'

void (async function() {
  const telegramBot = new TelegramBot()
  const discordBot = new DiscordBot()
  // await Promise.all([
  //   telegramBot.start(),
  //   discordBot.start(),
  // ])
  await telegramBot.start()
  await discordBot.start()
})()
