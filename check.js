const axios = require('axios');
const readline = require('readline');
const sdk = require('api')('@tokensniffer/v2.0#uea1oalm9dy116');
const fs = require('fs');

let processedAddresses = []; // Add this array to keep track of processed addresses

let counter = 0;
let tokenRetryAttempts = {};  // Object to track retry attempts for each token

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const API_KEY_DEX = 'ADDAPIKEYHERE';
const API_KEY_SNIFFER = 'ADDAPIKEYHERE';
const CHAIN = 'ethereal';
const ownershipRenouncedTracker = require('ownership-renounced-tracker');

const runSafetyChecks = (address, {
  liquidity,
  marketCap,
  isContractRenounced,
  txCount,
  holders,
  isFlagged,
  exploits,
  isSourceVerified,
  hasMint,
  hasProxy,
  isSellable,
  buyFee,
  sellFee,
  burnBalance,
  lockBalance
}) => {
  let safetyMessages = [];
  let safeCount = 0;
  const totalChecks = 10; // Updated number of total checks

  if (liquidity && liquidity > 10000) {
    safetyMessages.push("SAFE: Liquidity is $10,000+");
    safeCount++;
  } else {
    safetyMessages.push("NOT SAFE: Liquidity is < $10,000");
  }

  if (marketCap && marketCap < 100000) {
    safetyMessages.push("SAFE: Market cap is less than $100,000");
    safeCount++;
  } else {
    safetyMessages.push("NOT SAFE: Market cap is more than $100,000");
  }

  if (isFlagged === false) {
    safetyMessages.push("SAFE: Not flagged");
    safeCount++;
  } else {
    safetyMessages.push("NOT SAFE: Is flagged");
  }

  if (exploits === "None") {
    safetyMessages.push("SAFE: No known exploits");
    safeCount++;
  } else {
    safetyMessages.push(`NOT SAFE: Known exploits - ${exploits}`);
  }

    //if (isSourceVerified === true) {
    //safetyMessages.push("SAFE: Source is verified");
    //safeCount++;
    //} else {
    //safetyMessages.push("NOT SAFE: Source is not verified");
    // }

  if (hasMint === false) {
    safetyMessages.push("SAFE: No mint function");
    safeCount++;
  } else {
    safetyMessages.push("NOT SAFE: Has mint function");
  }

  if (hasProxy === false) {
    safetyMessages.push("SAFE: No proxy");
    safeCount++;
  } else {
    safetyMessages.push("NOT SAFE: Has proxy");
  }

  if (isSellable === true) {
    safetyMessages.push("SAFE: Is sellable");
    safeCount++;
  } else {
    safetyMessages.push("NOT SAFE: Not sellable");
  }

  if (buyFee !== null && buyFee <= 15) {
    safetyMessages.push("SAFE: Buy fee is 15% or less");
    safeCount++;
  } else {
    safetyMessages.push("NOT SAFE: Buy fee is more than 15%");
  }

  if (sellFee !== null && sellFee <= 15) {
    safetyMessages.push("SAFE: Sell fee is 15% or less");
    safeCount++;
  } else {
    safetyMessages.push("NOT SAFE: Sell fee is more than 15%");
  }
    
    if (lockBalance && lockBalance > 0) {
      safetyMessages.push("SAFE: Adequate lock balance");
      safeCount++;
    } else {
      safetyMessages.push("NOT SAFE: Inadequate lock balance");
    }

  // Print all safety messages
  safetyMessages.forEach((msg) => console.log(msg));

  // Check if all are safe
  if (safeCount === totalChecks) {
    console.log("\nBUY");
    fs.appendFile('buy.txt', address + '\n', (err) => {
      if (err) {
        console.error('Failed to save to file', err);
      } else {
        console.log(`Saved ${address} to buy.txt`);
      }
    });
  } else {
    console.log("\nNO BUY");
  }
};

const fetchTokenInfoSniffer = (address, safetyChecks) => {
  sdk
    .getTokenResults({
      apikey: API_KEY_SNIFFER,
      include_metrics: 'true',
      include_tests: 'false',
      block_until_ready: 'true',
      chain_id: '1',
      address: address,
    })
    .then(({ data }) => {
      console.log(`Is Flagged: ${data.is_flagged}`);
      const exploits = data.exploits?.length > 0 ? data.exploits.join(', ') : 'None';
      console.log(`Exploits: ${exploits}`);
      
      // Existing Contract Outputs
      for (const [key, value] of Object.entries(data.contract)) {
        console.log(`  ${key}: ${value}`);
      }

      console.log('Swap Simulation:');
      for (const [key, value] of Object.entries(data.swap_simulation || {})) {
        console.log(`  ${key}: ${value}`);
      }

      if (data.pools && data.pools.length > 0) {
        console.log('Pools:');
        data.pools.forEach((pool) => {
          for (const [key, value] of Object.entries(pool)) {
            console.log(`  ${key}: ${value}`);
          }
        });
      } else {
        console.log('Pools: None');
      }

      // Assuming that burnBalance and lockBalance are in the data object
        const burnBalance = data.pools && data.pools[0] ? data.pools[0].burn_balance : null;
        const lockBalance = data.pools && data.pools[0] ? data.pools[0].lock_balance : null;
        console.log('Burn Balance:', burnBalance);
        console.log('Lock Balance:', lockBalance);


        runSafetyChecks(address, {
        ...safetyChecks,
        txCount: parseInt(data.metrics?.txCount ?? '0', 10),
        holders: parseInt(data.metrics?.holders ?? '0', 10),
        isFlagged: data.is_flagged,
        exploits: exploits,
        isSourceVerified: data.contract?.is_source_verified ?? false,
        hasMint: data.contract?.has_mint ?? false,
        hasProxy: data.contract?.has_proxy ?? false,
        isSellable: data.swap_simulation?.is_sellable ?? false,
        buyFee: data.swap_simulation?.buy_fee ?? null,
        sellFee: data.swap_simulation?.sell_fee ?? null,
        burnBalance: burnBalance,
        lockBalance: lockBalance
      });
      
      // promptForTokenAddress();
    })
    .catch(err => {
      console.error(`An error occurred for token ${address}: ${err.message}. Skipping...`);
    });
};

const fetchPairInfo = async (pair) => {
  const response = await axios.get(`https://api.dextools.io/v1/pair`, {
    params: {
      chain: CHAIN,
      address: pair
    },
    headers: {
      'X-API-Key': API_KEY_DEX,
      'Accept': 'application/json'
    }
  });

  return response.data.data?.metrics?.liquidity ?? null;
};

const fetchTokenInfo = async (address) => {
  try {
    const response = await axios.get(`https://api.dextools.io/v1/token`, {
      params: {
        chain: CHAIN,
        address
      },
      headers: {
        'X-API-Key': API_KEY_DEX,
        'Accept': 'application/json'
      }
    });

    const data = response.data.data ?? {};
    
    console.log(`Name: ${data.name ?? 'None'}`);
    console.log(`Symbol: ${data.symbol ?? 'None'}`);
    console.log(`Token Address: ${address}`);
    console.log(`Is Contract Renounced: ${data.audit?.is_contract_renounced ?? 'None'}`);
    console.log(`Telegram: ${data.links?.telegram ?? 'None'}`);
    console.log(`Twitter: ${data.links?.twitter ?? 'None'}`);
    console.log(`Website: ${data.links?.website ?? 'None'}`);
    console.log(`Holders: ${data.metrics?.holders ?? 'None'}`);
    console.log(`Transaction Count: ${data.metrics?.txCount ?? 'None'}`);
  
    const currentPrice = data.reprPair?.price ?? 'None';
    const totalSupply = data.metrics?.totalSupply ?? 'None';
    const marketCap = (currentPrice !== 'None' && totalSupply !== 'None') ? (currentPrice * totalSupply) : 'None';
  
    console.log(`Current Price: ${currentPrice}`);
    console.log(`Market Cap: ${marketCap}`);

    const pair = data.reprPair?.id?.pair ?? 'None';
    let liquidity = null;

    if (pair !== 'None') {
      liquidity = await fetchPairInfo(pair);
    }

    fetchTokenInfoSniffer(address, { liquidity, marketCap: marketCap });
    
    tokenRetryAttempts[address] = 0;  // Reset retry attempts when successful

  } catch (error) {
    console.error('An error occurred for token', address, ':', error);
    handleTokenRetry(address);  // Handle the retry logic
  }
};

const handleTokenRetry = (address) => {
  if (tokenRetryAttempts[address] === undefined) {
    tokenRetryAttempts[address] = 1; // Initialize if not already present
  } else {
    tokenRetryAttempts[address]++;
  }

  if (tokenRetryAttempts[address] <= 20) {  // Retry for up to 20 minutes
    setTimeout(() => fetchTokenInfo(address), 60000);  // Retry after 1 minute
  } else {
    console.error(`NOBUY: Max retry attempts reached for token ${address}`);
  }
};

const promptForTokenAddress = () => {
  console.log();
  rl.question('Token Address: ', (address) => {
    fetchTokenInfo(address);
  });
};

const processTokensFromFile = () => {
  fs.readFile('renounced', 'utf-8', (err, data) => {
    if (err) {
      console.error('Error reading renounced:', err);
      return;
    }
  
    const addresses = data.split('\n').filter(addr => !!addr); // filter out any empty lines
    const newAddresses = addresses.filter(addr => !processedAddresses.includes(addr));
  
    if (newAddresses.length === 0) {
      counter++;
        process.stdout.write(`Checking renounced.txt... ${counter} \r`);

      return;
    }
  
    newAddresses.forEach((address) => {
      processedAddresses.push(address); // Mark this address as processed
      fetchTokenInfo(address);
      
      // Remove processed token from 'renounced' file
      setTimeout(() => {
        fs.writeFile('renounced', addresses.filter(a => a !== address).join('\n') + '\n', 'utf-8', err => {
          if (err) {
            console.error('Error writing to renounced:', err);
          } else {
            console.log(`Removed ${address} from renounced`);
          }
        });
      }, 15000);
    });
  });
};

setInterval(processTokensFromFile, 1000);  // It was 30000, now it's 1000 for 1 second