import HDWalletProvider from '@truffle/hdwallet-provider';
import Web3  from 'web3';
import DataFeed from './abis/ChainlinkDataFeed.json' assert {type: 'json'};
import Router from './abis/UniswapV2Router02.json' assert {type: 'json'};
import Pair from './abis/IUniswapV2Pair.json' assert {type: 'json'};
import Erc20 from './abis/IERC20.json' assert {type: 'json'};
import dotenv from 'dotenv';

dotenv.config();
const MNEMONIC = process.env.MNEMONIC;
const INFURA_KEY = process.env.INFURA_KEY;

const DATAFEED_ADDRESS = '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419';
const ROUTER_ADDRESS = '0xbB66cFAC2Fc7156F051785f3d4C1DA142A9C3b09';
const ETH_ADDRESS = '0x96BB8780Ea3a7e50F1Fc6d62B247c6D413060345';
const DAI_ADDRESS = '0xf1269dF4aBAc5ea8F63436491a47696cDC5c44E4';
const PAIR_ADDRESS = '0x1fDafD774c35Ba2F6Df555029c565cC2894acED7';
const FACTORY_ADDRESS = '0x511DB00D13Cb58B07213Fc640F1Da20E0da0765C';

const mainnetProvider = new HDWalletProvider(MNEMONIC,`https://mainnet.infura.io/v3/${INFURA_KEY}`);
const gwangjuProvider = new HDWalletProvider(MNEMONIC, 'https://gwangju.worldland.foundation/');
const web3Mainnet = new Web3(mainnetProvider);
const web3Gwangju = new Web3(gwangjuProvider);
const accountsGwangju = await web3Gwangju.eth.getAccounts();
const priceSetter = accountsGwangju[0];

const dataFeed = new web3Mainnet.eth.Contract(DataFeed, DATAFEED_ADDRESS);
const router = new web3Gwangju.eth.Contract(Router.abi, ROUTER_ADDRESS);
const pair = new web3Gwangju.eth.Contract(Pair.abi, PAIR_ADDRESS);
const eth = new web3Gwangju.eth.Contract(Erc20.abi, ETH_ADDRESS);
const dai = new web3Gwangju.eth.Contract(Erc20.abi, DAI_ADDRESS);

async function getBlockNumber(web3) {const latest = (await web3.eth.getBlock("latest")).number; return latest;}
async function setDeadline(web3, expiry) {
    const latest = (await web3.eth.getBlock("latest")).timestamp;
    return latest + 15n + expiry;
}
async function fetch(numberOfAnswers) {
    const latestRound = await dataFeed.methods.latestRound().call();
    const answerArray = new Array(numberOfAnswers*2);
    for (let index = 0; index < numberOfAnswers; index ++) {
        let targetRound = latestRound - Web3.utils.toBigInt(index);
        answerArray[index] = dataFeed.methods.getAnswer(targetRound).call();
        answerArray[numberOfAnswers + index] = dataFeed.methods.getTimestamp(targetRound).call();
    }
    let buffer = [];
    await Promise.all(answerArray).then((values) => {buffer = values;});
    return {
        "prices": buffer.slice(0,numberOfAnswers).reverse(), 
        "timestamps": buffer.slice(numberOfAnswers,2*numberOfAnswers).reverse()
    };
}

// async function predict(data) { //do something with data to generate prediction ...; return prediction; }

async function fetchAndSetPrice(numberOfInputData) {
    const answer = await fetch(numberOfInputData);
    const prediction = answer.prices; // prediction = await predict(answer)
    var blockNumber = await getBlockNumber(web3Gwangju);
    blockNumber += 1n;
    const txData = router.methods.setMarketPricesAtPool(ETH_ADDRESS, DAI_ADDRESS, blockNumber.toString(), prediction).encodeABI();
    const gasEst = await router.methods.setMarketPricesAtPool(ETH_ADDRESS, DAI_ADDRESS, blockNumber.toString(), prediction)
    .estimateGas({from: priceSetter, data: txData}); 
    const receipt = await router.methods.setMarketPricesAtPool(ETH_ADDRESS, DAI_ADDRESS, blockNumber.toString(), prediction)
    .send({
        from: priceSetter,
        data: txData,
        gas: gasEst + 20000n
    });
    return receipt;
}

// fetch price and input to contract
async function priceUpdate() {
    const answer = await fetch(10);
    console.log("Given prices : ", answer.prices);
    console.log("Given timestamps : ", answer.timestamps);
    const receipt = await fetchAndSetPrice(10);
    console.log("Tx: ", receipt);
    const recordedPrice = await pair.methods.getCurrentPrice().call();
    console.log("Recorded price in Pair contract (latest block): ", recordedPrice.toString())
}

// // check block number
// const currentBlock = await getBlockNumber(web3Gwangju);
// const blockLimit = await pair.methods.furthestBlockNumber().call();
// console.log('current block number (WLG) : ', currentBlock.number);
// console.log('available block limit : ', blockLimit);

// // quote 
// const result = await router.methods.quote(FACTORY_ADDRESS, 1000000000000000000n, ETH_ADDRESS, DAI_ADDRESS).call();
// console.log('expected output amount :', result);

await priceUpdate();
let deadline = await setDeadline(web3Gwangju, 3600n);
let currentBlock = await getBlockNumber(web3Gwangju);
let desiredAmountETH = 1000000000000000000n; // 1 ETH
let desiredAmountDAI = await router.methods.quote(FACTORY_ADDRESS, desiredAmountETH, ETH_ADDRESS, DAI_ADDRESS).call();

let txData = router.methods.addLiquidity(
    ETH_ADDRESS, 
    DAI_ADDRESS, 
    desiredAmountETH, 
    desiredAmountDAI, 
    desiredAmountETH * 9n / 10n, 
    desiredAmountDAI * 9n / 10n, 
    priceSetter, 
    deadline
).encodeABI();
let gasEst = await router.methods.addLiquidity(
    ETH_ADDRESS, 
    DAI_ADDRESS, 
    desiredAmountETH, 
    desiredAmountDAI, 
    desiredAmountETH * 9n / 10n, 
    desiredAmountDAI * 9n / 10n, 
    priceSetter, 
    deadline
).estimateGas({from: priceSetter, data: txData});
let tx = await router.methods.addLiquidity(
    ETH_ADDRESS, 
    DAI_ADDRESS, 
    desiredAmountETH, 
    desiredAmountDAI, 
    desiredAmountETH * 9n / 10n, 
    desiredAmountDAI * 9n / 10n, 
    priceSetter, 
    deadline
).send({from: priceSetter, data: txData, gas: gasEst + 20000n});
console.log(tx);

mainnetProvider.engine.stop();
gwangjuProvider.engine.stop();