const Web3 = require("web3");
const fs = require("fs");
const path = require("path");

let intervalCounter = 0;

const web3 = new Web3("wss://mainnet.infura.io/ws/v3/insertyourendpoint");

// Topic for OwnershipTransferred event
const ownershipTransferredTopic = web3.utils.keccak256("OwnershipTransferred(address,address)");

// Subscribe to logs with the topic for OwnershipTransferred
const options = {
  topics: [ownershipTransferredTopic],
};

const subscription = web3.eth.subscribe("logs", options);

// Keep track of processed addresses
const processedAddresses = new Set();

// Function to check if ownership has been renounced
function isOwnershipRenounced(topics, data) {
  // Topic for the zero address
  const zeroAddressTopic = "0x0000000000000000000000000000000000000000000000000000000000000000";

  // Check if the new owner is the zero address
  return topics[2] === zeroAddressTopic;
}

// Callback function when a new log is received
subscription.on("data", (event) => {
  try {
    const { topics, address } = event;

    if (isOwnershipRenounced(topics, event.data)) {
      // Only log and save to file if not already processed
      if (!processedAddresses.has(address)) {
        console.log(`Ownership renounced for: ${address}`);
        
        // Append to "renounced" file
        fs.appendFileSync(path.join(__dirname, 'renounced'), `${address}\n`);
        
        // Mark address as processed
        processedAddresses.add(address);
      }
    }
  } catch (error) {
    console.error(`Failed to decode log for event ${JSON.stringify(event.topics)}. Skipping...`);
  }
});

// Callback function when an error occurs
subscription.on("error", (error) => {
  console.error(`An error occurred: ${error}`);
});

setInterval(() => {
  intervalCounter++;
  process.stdout.write(`Scanning... ${intervalCounter} seconds elapsed\r`);
}, 1000);  // Update every 1 second
