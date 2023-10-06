import HDWalletProvider from '@truffle/hdwallet-provider';
import Web3  from 'web3';
import DataFeed from './abis/ChainlinkDataFeed.json' assert {type: 'json'};
import Router from './abis/UniswapV2Router02.json' assert {type: 'json'};
import dotenv from 'dotenv';

dotenv.config();
const MNEMONIC = process.env.MNEMONIC;
const INFURA_KEY = process.env.INFURA_KEY;

const DATAFEED_ADDRESS = '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419';
const ROUTER_ADDRESS = '0xbB66cFAC2Fc7156F051785f3d4C1DA142A9C3b09';
const ETH_ADDRESS = '0x96BB8780Ea3a7e50F1Fc6d62B247c6D413060345';
const DAI_ADDRESS = '0xf1269dF4aBAc5ea8F63436491a47696cDC5c44E4';

const mainnetProvider = new HDWalletProvider(MNEMONIC,`https://mainnet.infura.io/v3/${INFURA_KEY}`);
const gwangjuProvider = new HDWalletProvider(MNEMONIC, 'https://gwangju.worldland.foundation/');
const web3Mainnet = new Web3(mainnetProvider);
const web3Gwangju = new Web3(gwangjuProvider);
const accountsGwangju = await web3Gwangju.eth.getAccounts();
const priceSetter = accountsGwangju[0];

const dataFeed = new web3Mainnet.eth.Contract(DataFeed, DATAFEED_ADDRESS);
const router = new web3Gwangju.eth.Contract(Router.abi, ROUTER_ADDRESS);

async function getBlockNumber(web3) {const latest = (await web3.eth.getBlock("latest")).number; return latest;}
async function fetch(numberOfAnswers) {
    const latestRound = await dataFeed.methods.latestRound().call();
    const prices = new Array(numberOfAnswers);
    for (let index = 0; index < numberOfAnswers; index ++) {
        let targetRound = latestRound - Web3.utils.toBigInt(index);
        prices[index] = dataFeed.methods.getAnswer(targetRound).call();
    }
    let arr = [];
    await Promise.all(prices).then((values) => {arr = values;});
    return arr.reverse();
}

// async function predict(data) { //do something with data to generate prediction ...; return prediction; }

async function fetchAndSetPrice(numberOfInputData) {
    const answer = await fetch(numberOfInputData);
    const prediction = answer; // prediction = await predict(answer)
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

const prices = await fetch(10);
console.log("given predictions: ", prices);
const receipt = await fetchAndSetPrice(10)
console.log("Tx: ", receipt);

mainnetProvider.engine.stop();
gwangjuProvider.engine.stop();