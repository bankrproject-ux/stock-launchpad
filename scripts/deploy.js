const hre = require("hardhat");
const { ethers } = hre;
const inquirer = require("inquirer");

const DEFAULT_RPC =
  "https://rpc.mainnet.chain.robinhood.com";

const CHAIN_ID = 4663;

const DEFAULT_WETH =
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

const DEFAULT_USDG =
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

async function main() {
  console.clear();

  console.log(`
╔══════════════════════════════════════╗
║       STOCK LAUNCHPAD DEPLOYER       ║
║        Robinhood Chain Mainnet       ║
╚══════════════════════════════════════╝
`);

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "rpcUrl",
      message: "RPC URL:",
      default: DEFAULT_RPC
    },
    {
      type: "password",
      name: "privateKey",
      message: "Deployer private key:",
      mask: "*",
      validate(value) {
        if (!value) {
          return "Private key wajib diisi";
        }

        try {
          new ethers.Wallet(value);
          return true;
        } catch {
          return "Private key tidak valid";
        }
      }
    },
    {
      type: "input",
      name: "treasury",
      message: "Platform treasury address:",
      validate(value) {
        return ethers.isAddress(value)
          ? true
          : "Wallet address tidak valid";
      }
    },
    {
      type: "confirm",
      name: "enableWeth",
      message: `Enable WETH pair (${DEFAULT_WETH})?`,
      default: true
    },
    {
      type: "confirm",
      name: "enableUsdg",
      message: `Enable USDG pair (${DEFAULT_USDG})?`,
      default: true
    },
    {
      type: "input",
      name: "stockTokens",
      message:
        "Stock token addresses (pisahkan dengan koma, kosongkan jika belum):"
    }
  ]);

  const provider =
    new ethers.JsonRpcProvider(
      answers.rpcUrl,
      CHAIN_ID
    );

  const network =
    await provider.getNetwork();

  if (Number(network.chainId) !== CHAIN_ID) {
    throw new Error(
      `RPC bukan Robinhood Chain mainnet. Chain ID: ${network.chainId}`
    );
  }

  const wallet =
    new ethers.Wallet(
      answers.privateKey,
      provider
    );

  console.log("\n══════════════════════════════");
  console.log("NETWORK CHECK");
  console.log("══════════════════════════════");
  console.log("Chain ID:", network.chainId);
  console.log("Deployer:", wallet.address);

  const balance =
    await provider.getBalance(
      wallet.address
    );

  console.log(
    "ETH Balance:",
    ethers.formatEther(balance)
  );

  if (balance === 0n) {
    throw new Error(
      "Wallet tidak punya ETH untuk gas"
    );
  }

  console.log("\nDeploying Launchpad...");

  const Launchpad =
    await ethers.getContractFactory(
      "Launchpad",
      wallet
    );

  const launchpad =
    await Launchpad.deploy(
      answers.treasury
    );

  console.log(
    "Transaction:",
    launchpad.deploymentTransaction().hash
  );

  await launchpad.waitForDeployment();

  const launchpadAddress =
    await launchpad.getAddress();

  console.log(
    "\nLaunchpad deployed:",
    launchpadAddress
  );

  const pairAssets = [];

  if (answers.enableWeth) {
    pairAssets.push(DEFAULT_WETH);
  }

  if (answers.enableUsdg) {
    pairAssets.push(DEFAULT_USDG);
  }

  if (
    answers.stockTokens &&
    answers.stockTokens.trim() !== ""
  ) {
    const stocks =
      answers.stockTokens
        .split(",")
        .map((address) => address.trim())
        .filter(Boolean);

    for (const address of stocks) {
      if (!ethers.isAddress(address)) {
        throw new Error(
          `Stock token address tidak valid: ${address}`
        );
      }

      pairAssets.push(
        ethers.getAddress(address)
      );
    }
  }

  console.log("\nWhitelisting pair assets...");

  for (const asset of pairAssets) {
    console.log("Adding:", asset);

    const tx =
      await launchpad.setPairAsset(
        asset,
        true
      );

    await tx.wait();

    console.log("✓ Added");
  }

  console.log(`
╔══════════════════════════════════════╗
║           DEPLOY SUCCESS             ║
╚══════════════════════════════════════╝

Launchpad:
${launchpadAddress}

Treasury:
${answers.treasury}

Network:
Robinhood Chain Mainnet

Chain ID:
4663

Market Fee:
1.50%

Creator Fee:
0.85%

Platform Fee:
0.65%

Enabled Pair Assets:
${pairAssets.length}
`);

  console.log(
    `Explorer:\nhttps://robinhoodchain.blockscout.com/address/${launchpadAddress}`
  );
}

main().catch((error) => {
  console.error("\nDEPLOY FAILED\n");
  console.error(error);
  process.exit(1);
});
