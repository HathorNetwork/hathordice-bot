import { promisify } from 'util'

export function rollDice100(): number {
  return Math.floor(Math.random() * 100)
}

export function trunc(num: number, places: number): number {
  const pow10 = Math.pow(10, places)
  return Math.floor(num * pow10) / pow10
}

const sleep = promisify(setTimeout);
export function sleepSec(seconds: number): Promise<void> {
  return sleep(seconds * 1000)
}
