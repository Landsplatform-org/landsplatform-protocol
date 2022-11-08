const { ethers, network, run } = require("hardhat");
const config = require("../config");

const main = async () => {
  // Compile contracts
  await run("compile");
  console.log("Compiled contracts.");

  const networkName = network.name;

  // Sanity checks
  // if (networkName === "mainnet") {
  //   if (!process.env.KEY_MAINNET) {
  //     throw new Error("Missing private key, refer to README 'Deployment' section");
  //   }
  // } else if (networkName === "testnet") {
  //   if (!process.env.KEY_TESTNET) {
  //     throw new Error("Missing private key, refer to README 'Deployment' section");
  //   }
  // }

  // if (config.LandsplatformRouter[networkName] || config.LandsplatformRouter[networkName] === ethers.constants.AddressZero) {
  //   throw new Error("Missing router address, refer to README 'Deployment' section");
  // }

  // if (config.WBNB[networkName] || config.WBNB[networkName] === ethers.constants.AddressZero) {
  //   throw new Error("Missing WBNB address, refer to README 'Deployment' section");
  // }

  console.log("Deploying to network:", networkName);

  // Deploy LandsplatformZapV1
  console.log("Deploying Landsplatform V1..");

  const LandsplatformZapV1 = await ethers.getContractFactory("LandsplatformZapV1");

  const landsplatformZap = await LandsplatformZapV1.deploy(
    '0x10ed43c718714eb63d5aa57b78b54704e256024e',
    '0x10ed43c718714eb63d5aa57b78b54704e256024e',
    '50'
    
    // config.WBNB[networkName],
    // config.LandsplatformRouter[networkName],
    // config.MaxZapReverseRatio[networkName]
  );

  await landsplatformZap.deployed();

  console.log("LandsplatformZap V1 deployed to:", landsplatformZap.address);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });