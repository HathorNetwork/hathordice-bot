import assert from 'assert'
import * as util from './util'
import { Wallet } from './hathor'

class Odds {
  readonly probability: number;
  readonly multiplier: number;
  readonly minBet: number;
  readonly maxBet: number;

  constructor(mul: number, min: number, max: number) {
    this.probability = 1 / mul
    this.multiplier = mul
    this.minBet = min
    this.maxBet = max
    // TODO: support other types of dices
    assert(this.probability === util.trunc(this.probability, 2), 'multiplier should be valid for dice100')
  }

  get percentProb(): string {
    return (this.probability * 100).toFixed(2)
  }

  get minRoll(): number {
    return Math.floor(this.probability * 100)
  }

  prize(bet: number): number {
    return bet * this.multiplier
  }
}

const ODDS = [
  // TODO: make a list that makes sense
  new Odds(2, 1, 100),
  new Odds(10, 1, 10),
  new Odds(100, 1, 2)
]

function getOdds(mul: string): Odds | undefined {
  for (const odds of ODDS) {
    if (`${odds.multiplier}x` === mul) {
      return odds
    }
  }
}

export abstract class Conversation {
  readonly bot: Bot;

  constructor(bot: Bot) {
    this.bot = bot
  }

  abstract get content(): string;
  abstract isDirect(): boolean;
  abstract isPublicDedicated(): boolean;
  abstract isFromSelf(): boolean;
  abstract getUid(): string;
  abstract async respond(response: string): Promise<void>;
  abstract formatCmd(cmd: string): string;
  shouldRespond(): boolean { return (this.isDirect() || this.isPublicDedicated()) && !this.isFromSelf() }

  async handleCmd(): Promise<void> {
    if (!this.shouldRespond()) {
      return
    }
    const P = this.bot.prefixChar
    const args = this.content.slice(P.length).split(/ +/)
    const firstArg = args.shift()
    if (!firstArg) {
      return this.handleCmdNotFound('')
    }
    const command = firstArg.toLowerCase()

    // ignore non-commands on public channels (to allow conversations)
    if (!this.content.startsWith(P) && !this.isDirect()) {
      return Promise.resolve()
    }

    // TODO: use introspection to dynamically handle commands
    if (command === 'start') {
      return this.cmdStart(...args)
    } else if (command === 'help') {
      return this.cmdHelp(...args)
    } else if (command === 'odds') {
      return this.cmdOdds(...args)
    } else if (command === 'deposit') {
      if (this.isDirect()) {
        return this.cmdDeposit(...args)
      } else {
        return this.handleOnlyDM(command)
      }
    } else if (command === 'withdraw') {
      if (this.isDirect()) {
        return this.cmdWithdraw(...args)
      } else {
        return this.handleOnlyDM(command)
      }
    } else if (command === 'balance') {
      if (this.isDirect()) {
        return this.cmdBalance(...args)
      } else {
        return this.handleOnlyDM(command)
      }
    } else if (command === 'bet') {
      if (!this.isDirect()) {
        return this.cmdBet(...args)
      } else {
        return this.handleOnlyPublic(command)
      }
    } else {
      return this.handleCmdNotFound(command)
    }
  }

  async handleOnlyDM(cmd: string): Promise<void> {
    await this.respond(`Please DM me for ${this.formatCmd(cmd)}, can't do that in public.`)
  }

  async handleOnlyPublic(cmd: string): Promise<void> {
    await this.respond(`Please do ${this.formatCmd(cmd)} on the public channel, can't do that in private.`)
  }

  async handleCmdNotFound(cmd: string): Promise<void> {
    await this.respond(`I dodn't understand ${this.formatCmd(cmd)}. Say ${this.formatCmd('help')} if you need any.`)
  }

  async cmdStart(..._args: string[]): Promise<void> {
    await this.respond(`Say ${this.formatCmd('help')} to start`)
  }

  async cmdHelp(..._args: string[]): Promise<void> {
    // TODO: use introspection to generate list of commands
    await this.respond(`Hello, this is ${this.bot.name}, I understand the following commands:
${this.formatCmd('help')}: show this help
${this.formatCmd('odds')}: list of valid reward multiplier, odds, and max bet amount for each multiplier
${this.formatCmd('deposit')}: [DM only] respond with deposit address
${this.formatCmd('withdraw [amount] [address]')}: [DM only] move your funds to the given address
${this.formatCmd('balance')}: [DM only] show your balance
${this.formatCmd('bet [multiplier] [amount]')}: [public channel only]`)
  }

  async cmdOdds(..._args: string[]): Promise<void> {
    // XXX: consider that not every frontend will support markdown formatting
    const respLines = ODDS.map(odds => `*${odds.multiplier}x*: ${odds.percentProb}% of winning, min bet: ${odds.minBet} HTR, max bet: ${odds.maxBet} HTR. You win when rolled dice is less than ${odds.minRoll}`)
    respLines.unshift(`These are the accepted multipliers for ${this.formatCmd('bet')}:`)
    await this.respond(respLines.join('\n'))
  }

  async cmdDeposit(..._args: string[]): Promise<void> {
    await this.respond('TODO: deposit')
  }

  async cmdWithdraw(...args: string[]): Promise<void> {
    const user = await this.bot.getUser(this.getUid())
    if (!user.canWithdraw) {
      await this.respond('You cannot withdraw yet, please make at least one bet.')
      return
    }
    await this.respond(`TODO: withdraw (${args.join(' ')})`)
  }

  async cmdBalance(..._args: string[]): Promise<void> {
    await this.respond('I\'ll check it out, give me sec.')
    const user = await this.bot.getUser(this.getUid())
    const balance = await user.wallet.getBalance()
    let resp = `Your balance is ${balance.toFixed(2)} HTR. `
    if (user.canWithdraw) {
      resp += 'You can withdraw anytime.'
    } else {
      resp += 'You cannot withdraw yet, please make at least one bet.'
    }
    await this.respond(resp)
  }

  async cmdBet(...args: string[]): Promise<void> {
    const user = await this.bot.getUser(this.getUid())
    if (args.length !== 2) {
      await this.respond('You need to specify a multiplier and a betting amount.')
      return
    }
    const [mul, amountString] = args
    const odds = getOdds(mul)
    if (!odds) {
      await this.respond(`The multiplier "${mul}" isn't valid`)
      return
    }
    const amount = Number(amountString)
    const prize = odds.prize(amount)
    const prizeTransferAmount = prize - amount
    if (amount !== util.trunc(amount, 2)) {
      await this.respond('Amount must contain at most 2 decimial places, just like you would on a Hathor transaction.')
      return
    }
    if (amount < odds.minBet) {
      await this.respond(`The minimum allowed bet for ${mul} is ${odds.minBet} HTR.`)
      return
    }
    if (amount > odds.maxBet) {
      await this.respond(`The maximum allowed bet for ${mul} is ${odds.maxBet} HTR.`)
      return
    }
    const balance = await user.wallet.getBalance()
    if (amount > balance) {
      await this.respond(`Your balance is ${balance.toFixed(2)} HTR, not enough for the desired bet.`)
      return
    }
    const minRoll = odds.minRoll
    const userAddress = await user.wallet.getAddress()
    const botAddress = await this.bot.betsWallet.getAddress()
    const betBudget = await this.bot.betsWallet.getBalance()
    if (prizeTransferAmount > betBudget) {
      await this.respond(`😥 Sorry I can't cover that bet. Maybe try a smaller amount or ask the maintainers to give me more budget.`)
      return
    }
    await this.respond(`All set! If it rolls less than ${minRoll} (out of 100) you win ${prize} HTR. 🥁...`)
    // XXX: simulated delay, for suspense, this can be reduced or removed later when network latency kicks in
    await util.sleepSec(3)
    // TODO: support auditable or at least external dice (maybe start with random.org)
    const dice = util.rollDice100()
    if (dice < minRoll) {
      await this.bot.betsWallet.sendTo(userAddress, prize)
      const newBalance = await user.wallet.getBalance()
      await this.respond(`🥳 Rolled 🎲 ${dice}. 🎉 You won! 🎉 Your new balance is ${newBalance.toFixed(2)} HTR`)
    } else {
      await user.wallet.sendTo(botAddress, amount)
      // TODO: await transfer
      // TODO: maybe fake balance and backlog the transactions
      const newBalance = await user.wallet.getBalance()
      await this.respond(`😔 Rolled 🎲 ${dice}. You lost! Better luck next time. Your new balance is ${newBalance.toFixed(2)} HTR`)
    }
    user.canWithdraw = true
  }
}

class User {
  wallet: Wallet;
  canWithdraw: boolean;

  constructor(id: string) {
    this.wallet = new Wallet(id, id)
    this.canWithdraw = false
  }
}

interface StringMap<T> {
  [x: string]: T;
}

export abstract class Bot {
  #users: StringMap<User>;
  betsWallet: Wallet;
  bonusWallet: Wallet;
  readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix
    this.#users = {}
    // TODO: maybe prefix the passphrase so it isn't the same as the nickname
    const betsPassphrase = `${prefix}-bets`
    this.betsWallet = new Wallet(betsPassphrase, betsPassphrase)
    const bonusPassphrase = `${prefix}-bonus`
    this.bonusWallet = new Wallet(bonusPassphrase, bonusPassphrase)
  }

  async start(): Promise<void> {
    // await Promise.all([this.betsWallet.start(), this.bonusWallet.start()])
    await this.betsWallet.start()
    await this.bonusWallet.start()
    const [
      betsAddress,
      betsBalance,
      bonusAddress,
      bonusBalance,
    ] = await Promise.all([
      this.betsWallet.getAddress(),
      this.betsWallet.getBalance(),
      this.bonusWallet.getAddress(),
      this.bonusWallet.getBalance(),
    ])
    console.info(`${this.prefix}-bets ${betsBalance} HTR address: ${betsAddress}`)
    console.info(`${this.prefix}-bonus ${bonusBalance} HTR address: ${bonusAddress}`)
  }

  abstract get prefixChar(): string;

  get name(): string {
    return 'HathorDice Bot'
  }

  get initialBalance(): number { return 5.00 }

  async getUser(uid: string): Promise<User> {
    console.debug('getUser', uid)
    let user = this.#users[uid]
    if (!user) {
      user = new User(`${this.prefix}-${uid}`)
      await this.initUserWallet(user.wallet)
      this.#users[uid] = user
    }
    console.debug('gotUser', uid)
    return user
  }

  async initUserWallet(wallet: Wallet): Promise<void> {
    console.debug('initUserWallet', wallet)
    // TODO: check if wallet ever had any tx before sending initial balance
    const address = await wallet.getAddress()
    const bonusBudget = await this.bonusWallet.getBalance()
    if (bonusBudget < this.initialBalance) {
      // TODO: give some feedback to the user that they couldn't get an initial bonus balance
      console.warn('bot: no budget available for giving user an initial bonus')
      return
    }
    const sent = await this.bonusWallet.sendTo(address, this.initialBalance)
    if (!sent) {
      console.error(`failed to send ${this.initialBalance} to new user with address ${address}`)
    }
    // TODO: verify if it was sent successfully
    console.debug('inittedUserWallet', wallet)
  }
}
