// Telegram frontend
//
// Uses https://github.com/yagop/node-telegram-bot-api/blob/master/doc/api.md which isn't that polished, but [Telegram's API](https://core.telegram.org/bots/api) is, and this lib is very thin around it.

import assert from 'assert'
import { Bot, Conversation } from './bot'

// XXX: manual fix to disable warning:
// See https://github.com/yagop/node-telegram-bot-api/issues/319
import BluebirdPromise from 'bluebird'
BluebirdPromise.config({
  cancellation: true
})
process.env.NTBA_FIX_319 = 'true'

import Telegram from 'node-telegram-bot-api'

const telegramConfig = {
  chatIds: (process.env.TELEGRAM_CHAT_IDS ?? '').split(',').filter(Boolean).map(i => parseInt(i)),
  accessToken: process.env.TELEGRAM_ACCESS_TOKEN ?? '',
}

class TelegramConversation extends Conversation {
  #msg: Telegram.Message

  // msg is a https://core.telegram.org/bots/api#message
  constructor(bot: TelegramBot, msg: Telegram.Message) {
    super(bot)
    this.#msg = msg
  }

  get content(): string {
    return this.#msg.text ?? ''
  }

  isDirect(): boolean {
    return this.#msg.chat.type === 'private'
  }

  isPublicDedicated(): boolean {
    return telegramConfig.chatIds.indexOf(this.#msg.chat.id) >= 0
  }

  isFromSelf(): boolean {
    return (this.bot as TelegramBot)._myUserId === this.#msg.from?.id
  }

  getUid(): string {
    const uid = this.#msg.from?.id.toString()
    assert(uid, 'uid cannot be empty, abort')
    return uid
  }

  async respond(response: string): Promise<void> {
    console.log(`telegram: ${this.#msg.chat.id} send "${response}"`)
    await (this.bot as TelegramBot)._sendMessage(this.#msg.chat.id, response)
  }

  formatCmd(cmd: string): string {
    return `*/${cmd}*`
  }
}

export class TelegramBot extends Bot {
  #client: Telegram
  #me?: Telegram.User

  constructor() {
    super('telegram') // XXX: changing this makes previous wallets inaccessible, treat with care
    assert(telegramConfig.accessToken, 'env var TELEGRAM_ACCESS_TOKEN empty or unset')
    this.#client = new Telegram(telegramConfig.accessToken, { polling: { autoStart: false } })
    this.#client.on('message', msg => {
      console.log(`telegram: ${msg.chat.id} recv "${msg.text || ''}"`)
      // console.debug(msg)
      void (new TelegramConversation(this, msg)).handleCmd()
    })
    // TODO: telegram supports a command list (setMyCommands) to with text completion on chat clients, we could use that
  }

  async start(): Promise<void> {
    await super.start()
    this.#me = await this.#client.getMe()
    await this.#client.startPolling()
    console.log(`telegram: logged in as "${this.#me.first_name}"`)
  }

  get prefixChar(): string {
    return '/'
  }

  get _myUserId(): number {
    return this.#me?.id ?? -1
  }

  async _sendMessage(chatId: number, body: string): Promise<void> {
    await this.#client.sendMessage(chatId, body, { parse_mode: 'Markdown' })
  }
}
