import assert from 'assert'
import { Connection, MemoryStore, HathorWallet, storage, constants } from '@hathor/wallet-lib';
import * as util from './util'

const { HATHOR_TOKEN_CONFIG } = constants

const hathorConfig = {
  seed: (() => {
    const seed = process.env.HATHOR_WALLET_SEED
    assert(seed, 'seed cannot be empty, abort')
    return seed
  })(),
  network: process.env.HATHOR_NETWORK ?? 'mainnet',
}

function newWalletFromPassphrase(passphrase: string): HathorWallet {
  const store = new MemoryStore()
  storage.setStore(store)  // XXX: why is this even needed??
  const seed = hathorConfig.seed
  const network = hathorConfig.network
  const connection = new Connection({ network })
  // TODO: maybe prefix passphrase for additional security
  return new HathorWallet({
    seed,
    connection,
    store,
    passphrase
  });
}

// nickname is only used for logs
async function initWallet(wallet: HathorWallet, nickname: string): Promise<void> {
  const info = await wallet.start()

  assert(info.network === hathorConfig.network, 'wrong network, abort')

  return new Promise((resolve, reject) => {
    const waitForReadyState = (state: number) => {
      switch (state) {
        case HathorWallet.READY:
          console.info(`hathor: wallet:${nickname} ready`)
          resolve()
          break
        case HathorWallet.CLOSED:
          reject(new Error(`wallet:${nickname} closed`))
          break
        case HathorWallet.CONNECTING:
        case HathorWallet.SYNCING:
          console.info(`hathor: wallet:${nickname} loading`)
          wallet.once('state', waitForReadyState)
          break
        default:
          reject(new Error(`wallet:${nickname} unknown state`))
      }
    }
    wallet.once('state', waitForReadyState)
  })
}

export class Wallet {
  #hathorWallet: HathorWallet;
  #started: boolean;
  #nickname: string;

  constructor(passphrase: string, nickname: string) {
    this.#started = false
    this.#hathorWallet = newWalletFromPassphrase(passphrase)
    this.#nickname = nickname
  }

  async start(): Promise<void> {
    this.#started = true  // this isn't supposed to track if it's ready only if we have called "start"
    await initWallet(this.#hathorWallet, this.#nickname)
  }

  async getAddress(): Promise<string> {
    // XXX: simulated delay
    await util.sleepSec(0.1)
    return this.#hathorWallet.getCurrentAddress()
  }

  async getBalance(): Promise<number> {
    // XXX: simulated delay
    await util.sleepSec(0.1)
    const unitAmount = this.#hathorWallet.getBalance(HATHOR_TOKEN_CONFIG).available // tokenID=0 is HTR
    return unitAmount / 100
  }

  async sendTo(address: string, amount: number): Promise<boolean> {
    // TODO: validate address
    console.debug(`send ${amount} to ${address}`)
    const unitAmount = amount * 100
    // XXX: simulated delay
    await this.#hathorWallet.sendTransaction(address, unitAmount, HATHOR_TOKEN_CONFIG)
    return true
  }
}
