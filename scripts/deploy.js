const hre = require("hardhat");
const { ethers } = hre;

const DEFAULT_RPC =
  "https://rpc.mainnet.chain.robinhood.com";

const CHAIN_ID = 4663;

const DEFAULT_WETH =
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

const DEFAULT_USDG =
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

async function main() {
  // FIX: inquirer v9 adalah ESM
  const inquirer = (await import("inquirer")).default;

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
      default: DEFAULT_RPC,
      validate(value) {
        return value.trim()
          ? true
          : "RPC URL wajib diisi";
      }
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
          new ethers.Wallet(value.trim());
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
        return ethers.isAddress(value.trim())
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

  console.log("\nChecking network...");

  const provider = new ethers.JsonRpcProvider(
    answers.rpcUrl.trim()
  );

  const network = await provider.getNetwork();

  if (Number(network.chainId) !== CHAIN_ID) {
    throw new Error(
      `RPC salah. Dapat Chain ID ${network.chainId}, seharusnya ${CHAIN_ID}`
    );
  }

  const privateKey = answers.privateKey.trim();

  const wallet = new ethers.Wallet(
    privateKey,
    provider
  );

  const treasury = ethers.getAddress(
    answers.treasury.trim()
  );

  console.log("\n══════════════════════════════");
  console.log("NETWORK CHECK");
  console.log("══════════════════════════════");
  console.log("Chain ID:", network.chainId);
  console.log("Deployer:", wallet.address);

  const balance = await provider.getBalance(
    wallet.address
  );

  console.log(
    "Gas balance:",
    ethers.formatEther(balance)
  );

  if (balance === 0n) {
    throw new Error(
      "Wallet tidak punya saldo untuk gas"
    );
  }

  console.log("\nDeploying Launchpad...");

  const Launchpad = await ethers.getContractFactory(
    "Launchpad"
  );

  // Connect factory ke wallet + RPC Robinhood
  const launchpad = await Launchpad
    .connect(wallet)
    .deploy(treasury);

  console.log(
    "\nDeploy transaction:"
  );

  console.log(
    launchpad.deploymentTransaction().hash
  );

  console.log("\nWaiting for confirmation...");

  await launchpad.waitForDeployment();

  const launchpadAddress =
    await launchpad.getAddress();

  console.log(
    "\n✓ Launchpad deployed!"
  );

  console.log(
    "Address:",
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
    const stocks = answers.stockTokens
      .split(",")
      .map(address => address.trim())
      .filter(address => address.length > 0);

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

  if (pairAssets.length > 0) {
    console.log(
      "\nWhitelisting pair assets..."
    );

    for (const asset of pairAssets) {
      console.log(
        "\nAdding pair:",
        asset
      );

      const tx =
        await launchpad.setPairAsset(
          asset,
          true
        );

      console.log(
        "Transaction:",
        tx.hash
      );

      await tx.wait();

      console.log("✓ Added");
    }
  }

  console.log(`
╔══════════════════════════════════════╗
║           DEPLOY SUCCESS             ║
╚══════════════════════════════════════╝

Launchpad:
${launchpadAddress}

Treasury:
${treasury}

Network:
Robinhood Chain Mainnet

Chain ID:
${CHAIN_ID}

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
    "══════════════════════════════"
  );
}

main().catch(error => {
  console.error("\n╔══════════════════════════════╗");
  console.error("║         DEPLOY FAILED        ║");
  console.error("╚══════════════════════════════╝\n");

  console.error(error);

  process.exit(1);
});
