const path = require('path');
const { ethers } = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'ethers'));
const fs = require('fs');

const GANACHE_URL = 'http://127.0.0.1:7545';
const CONTRACT_JSON_PATH = path.join(__dirname, '..', 'contracts_LandRegistry_sol_LandRegistry.abi');
const CONTRACT_BIN_PATH = path.join(__dirname, '..', 'contracts_LandRegistry_sol_LandRegistry.bin');
const ENV_PATH = path.join(__dirname, '..', 'frontend', '.env');

async function main() {
  console.log('=== Checking TerraLedger Demo State ===');
  const provider = new ethers.JsonRpcProvider(GANACHE_URL);
  
  try {
    const network = await provider.getNetwork();
    console.log('✅ Ganache is running (Chain ID:', network.chainId.toString(), ')');
  } catch (e) {
    console.error('❌ Ganache is NOT running! Please open Ganache GUI on port 7545.');
    return;
  }

  const accounts = await provider.listAccounts();
  if (!accounts || accounts.length === 0) {
    console.error('❌ No accounts found in Ganache.');
    return;
  }
  const adminSigner = accounts[0];
  console.log('Admin account (Account 0):', adminSigner.address);

  // Read current contract from .env
  let currentEnv = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const match = currentEnv.match(/VITE_CONTRACT_ADDRESS=(0x[a-fA-F0-9]{40})/);
  let contractAddress = match ? match[1] : null;

  const abi = JSON.parse(fs.readFileSync(CONTRACT_JSON_PATH, 'utf8'));
  let contract = contractAddress ? new ethers.Contract(contractAddress, abi, adminSigner) : null;
  let isAlive = false;

  if (contract) {
    try {
      const code = await provider.getCode(contractAddress);
      if (code && code !== '0x') {
        const count = await contract.propertyCount();
        console.log(`✅ Current Contract is ALIVE at ${contractAddress} with ${count} registered properties.`);
        isAlive = true;
      }
    } catch (e) {
      isAlive = false;
    }
  }

  if (!isAlive) {
    console.log('⚠️ Contract not found or Ganache was restarted. Deploying fresh contract now...');
    const bytecode = '0x' + fs.readFileSync(CONTRACT_BIN_PATH, 'utf8').trim();
    const factory = new ethers.ContractFactory(abi, bytecode, adminSigner);
    const deployedContract = await factory.deploy();
    await deployedContract.waitForDeployment();
    contractAddress = await deployedContract.getAddress();
    console.log(`🎉 Deployed new contract to: ${contractAddress}`);

    // Update .env
    const newEnv = `VITE_CONTRACT_ADDRESS=${contractAddress}\nVITE_IPFS_GATEWAY=http://127.0.0.1:8082/ipfs\nVITE_CHAIN_ID=1337\n`;
    fs.writeFileSync(ENV_PATH, newEnv, 'utf8');
    console.log('✅ Updated frontend/.env with new contract address.');

    contract = new ethers.Contract(contractAddress, abi, adminSigner);

    // Register Property 1
    console.log('📝 Registering Property #1...');
    const dummyHash = '0x7b6d17b5f54316a751a0d8e202521cf9a764d8a2a0a38f3de7492c23577d3372';
    const tx = await contract.registerLand(
      'Plot 27, Demo Residency, Worli, Mumbai, Maharashtra (fictional)',
      1000,
      adminSigner.address,
      ethers.parseEther('2.5'),
      'QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx',
      dummyHash
    );
    await tx.wait();
    console.log('✅ Property #1 registered successfully!');
  }

  const finalCount = await contract.propertyCount();
  console.log(`\n🚀 SYSTEM READY! Total Properties on Blockchain: ${finalCount}`);
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Admin Address: ${adminSigner.address}`);
}

main().catch(console.error);
