// Discord frontend
//
// Uses https://discord.js.org/ which is very well documented.

import { Client, Message } from 'discord.js'
import { Bot, Conversation } from './bot'

const discordConfig = {
  channelIds: (process.env.DISCORD_PUBLIC_CHANNEL_IDS ?? '').split(',').filter(Boolean),
  token: process.env.DISCORD_TOKEN ?? '',
}

class DiscordConversation extends Conversation {
  #msg: Message;

  constructor(bot: DiscordBot, msg: Message) {
    super(bot)
    this.#msg = msg
  }

  get content(): string {
    return this.#msg.content
  }

  isDirect(): boolean {
    return this.#msg.channel.type === 'dm'
  }

  isPublicDedicated(): boolean {
    return discordConfig.channelIds.indexOf(this.#msg.channel.id) >= 0
  }

  isFromSelf(): boolean {
    return (this.bot as DiscordBot)._myUserId === this.#msg.author.id
  }

  getUid(): string {
    return this.#msg.author.id
  }

  async respond(response: string): Promise<void> {
    console.log(`discord: ${this.#msg.channel.id} send "${response}"`)
    await this.#msg.channel.send(response)
  }

  formatCmd(cmd: string): string {
    return `\`/${cmd}\``
  }
}

export class DiscordBot extends Bot {
  #client: Client

  constructor() {
    super('discord') // XXX: changing this makes previous wallets inaccessible, treat with care
    this.#client = new Client()
    this.#client.once('ready', () => {
      console.log(`discord: logged in as "${this.#client.user?.tag ?? '?'}"`)
    })
    this.#client.on('message', msg => {
      const convo = new DiscordConversation(this, msg)
      // early ignore if looping msg
      if (convo.isFromSelf()) { return }
      console.log(`discord: ${msg.channel.id} recv "${msg.content}"`)
      // console.debug(msg)
      void convo.handleCmd()
    })
  }

  async start(): Promise<void> {
    await super.start()
    await this.#client.login(discordConfig.token)
  }

  get prefixChar(): string {
    return '/'
  }

  get _myUserId(): string {
    return this.#client.user?.id ?? ''
  }
}
