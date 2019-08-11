/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Twitter from 'twitter';
import uuid from 'uuid';
import sha1 from 'js-sha1';

import config from './config';
import { HathorWallet } from '@hathor/wallet-lib';

const validGames = {
  '1000x': {
    multiplier: 1000,
    betNumber: 65,
    maxBet: 0.1,
  },
  '100x': {
    multiplier: 100,
    betNumber: 649,
    maxBet: 1,
  },
  '50x': {
    multiplier: 50,
    betNumber: 1298,
    maxBet: 2,
  },
  '25x': {
    multiplier: 25,
    betNumber: 2596,
    maxBet: 4,
  },
  '10x': {
    multiplier: 10,
    betNumber: 6488,
    maxBet: 10,
  },
  '3x': {
    multiplier: 3,
    betNumber: 21627,
    maxBet: 35,
  },
  '2x': {
    multiplier: 2,
    betNumber: 32440,
    maxBet: 50,
  },
  '1.5x': {
    multiplier: 1.5,
    betNumber: 43253,
    maxBet: 75,
  },
};

/**
 * runningGames = Dict[address, {
 *   game,
 *   tweet,
 *   secretKey,
 * }]
 *
 * Let's play a 2x game.
 * Let's play a 1.5x game.
 **/
class Manager {
  constructor(config) {
    this.onWalletStateChange = this.onWalletStateChange.bind(this);
    this.onNewTx = this.onNewTx.bind(this);
    this.onNewTweet = this.onNewTweet.bind(this);

    this.wallet = new Wallet(config);
    this.wallet.on('state', this.onWalletStateChange);
    this.wallet.on('new-tx', this.onNewTx);

    this.twitter = new Twitter(config);

    this.runningGames = {};
  }

  onWalletStateChange(state) {
    if (state === Wallet.CLOSED) {
      console.log('Wallet is disconnected.');

    } else if (state === Wallet.CONNECTING) {
      console.log('Wallet is connecting...');

    } else if (state === Wallet.SYNCING) {
      console.log('Wallet is connected and syncing...');

    } else if (state === Wallet.READY) {
      console.log('Wallet is ready!');
      const currentAddress = this.wallet.getCurrentAddress();
      console.log('Current address:', currentAddress);

      this.runningGames[currentAddress] = {
        game: validGames['50x'],
        secretKey: uuid.v4(),
        tweet: null,
      };
      //this.startTwitter();

    } else {
      console.log('Wallet unknown state:', state);
    }
  }

  onNewTx(tx) {
    // Get user address (to send the rewards).
    if (tx.inputs.length === 0) {
      //console.log(`Skipping ${tx.tx_id}... No inputs?!`);
      return;
    }

    const input = tx.inputs[0];
    if (!input.decoded) {
      console.log(`Skipping ${tx.tx_id}... Input has not been decoded.`);
      return;
    }
    const userAddress = input.decoded.address;

    // Look for outputs that match running games.
    const validOutputs = {};
    for (const txout of tx.outputs) {
      if (txout.token !== '00') {
        continue;
      }
      if (!txout.decoded) {
        continue;
      }
      const address = txout.decoded.address;
      if (this.runningGames[address]) {
        if (validOutputs[address]) {
          validOutputs[address] += txout.value;
        } else {
          validOutputs[address] = txout.value;
        }
      }
    }
    if (validOutputs.length === 0) {
      console.log(`Skipping ${tx.tx_id}... Game not found.`);
      return;
    }

    // Check out the result of each game.
    for (const [localAddress, value] of Object.entries(validOutputs)) {
      const x = this.runningGames[localAddress];
      delete this.runningGames[localAddress];

      const finalValue = Math.min(x.game.maxBet * 100, Math.floor(value * x.game.multiplier));
      const token = Wallet.HTR_TOKEN;

      // Check who wins.
      const hash = sha1.create()
      hash.update(x.secretKey)
      hash.update(tx.tx_id);
      const longHex = hash.hex();
      const shortHex = longHex.slice(-4);
      const number = parseInt(`0x${shortHex}`);
      console.log('@@', {
        secretKey: x.secretKey,
        txHash: tx.tx_id,
        longHex,
        shortHex,
        number,
        betNumber: x.game.betNumber
      });

      if (number > x.game.betNumber) {
        const replyMessage = `You lose! Your random number was ${number}, which is bigger than ${x.game.betNumber}. Keep playing!\n\nYour secret key was: ${x.secretKey}`;
        console.log(replyMessage);
        continue;
      }

      this.wallet.sendTransaction(userAddress, finalValue, token).then((response) => {
        if (response.success) {
          const newTx = response.tx;
          const value_str = `${finalValue / 100} HTR`;
          const url = `https://explorer.hathor.network/transaction/${newTx.hash}`;

          //const tweet = x.tweet;
          //const username = tweet.user.screen_name;
          const username = 'msbrogli';

          const replyMessage = `You won! Congrats, @${username}!\nI just sent ${value_str} to ${userAddress}. Keep playing!\n\nYour secret key was: ${x.secretKey}\n\n${url}`;
          console.log(replyMessage);
          //this.replyTweet(tweet, replyMessage);

        } else {
          console.log('Error:', response);
          const replyMessage = "Something went wrong sending your tokens. We are checking and will make the transfer manually. Sorry about that."
          this.replyTweet(tweet, replyMessage);
        }

      }).catch((error) => {
        console.log('Error sending tokens:', error);
        const replyMessage = "Something went wrong sending your tokens. We are checking and will make the transfer manually. Sorry about that."
        this.replyTweet(tweet, replyMessage);
      });
    }
  }

  likeTweet(tweet) {
    this.twitter.post('favorites/create', { id: tweet.id_str }, function(err, response) {
      if (err) {
        console.log('likeTweet error:', err[0].message);
        return;
      }

      let username = response.user.screen_name;
      let tweetId = response.id_str;
      console.log(`Tweet liked: https://twitter.com/${username}/status/${tweetId}`)
    });
  }

  onNewTweet(tweet) {
    console.log(`New tweet found: ${tweet.text}`);

    if (this.wallet.state !== Wallet.READY) {
      console.log('Wallet is not ready. Skipping tweet...');
      this.replyTweet(tweet, `The board is closed now. Come back later, please.`);
      return;
    }

    let text = tweet.text;
    text = text.replace('@HathorDice', '');
    text = text.replace(/\s+/g, ' ')
    text = text.trim();
    text = text.toLowerCase();
    match = text.match(/^let's play a ([0-9.]+x) game[!.? ]*$/)

    const key = match[1];
    const game = validGames[key];

    if (!game) {
      this.replyTweet(tweet, `You must tweet "Let's play a 2x game! @HathorDice".\nI accept 1.5x, 2x, 3x, 10x, 25x, 50x, 100x, and 1000x bets!`);
      return;
    }

    const address = wallet.getAddressToUse();
    const secretKey = uuid.v4();
    const secretKeyHash = sha1.hex(secretKey);
    this.likeTweet(tweet);
    this.replyTweet(tweet, `Game on! Send your HTR to ${address} (max bet ${game.maxBet} HTR).\nGame ID: ${secretKeyHash} (testnet-bravo)`);

    this.runningGames[address] = {
      game,
      tweet,
      secretKey,
    };
  }

  replyTweet(tweet, message) {
    const data = {
      in_reply_to_status_id: tweet.id_str,
      status: message,
    };
    this.twitter.post('statuses/update', data, function(err, response) {
      if (err) {
        console.log('replyTweet error:', err[0].message);
        return;
      }

      let username = response.user.screen_name;
      let tweetId = response.id_str;
      console.log(`Tweet replied: https://twitter.com/${username}/status/${tweetId}`)
    });
  }

  start() {
    this.wallet.start();
  }

  startTwitter() {
    this.twitter.stream('statuses/filter', {track:'@HathorDice'}, (stream) => {
      console.log('Twitter ready!');
      stream.on('data', this.onNewTweet);
      stream.on('error', (error) => {
        throw error;
      });
    });
  }
}

const manager = new Manager(config);
manager.start();
