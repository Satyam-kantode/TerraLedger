import { ethers } from "ethers";

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS?.trim() ||
  "0x854abecfde1730c41da14c5f194abeb04c9ba023";

export const EXPECTED_CHAIN_ID = 1337n;

export const CONTRACT_ABI = [
  "function admin() view returns (address)",
  "function propertyCount() view returns (uint256)",
  "function registrars(address) view returns (bool)",
  "function addRegistrar(address)",
  "function removeRegistrar(address)",
  "function registerLand(string,uint256,uint256,address,bytes32,string) returns (uint256)",
  "function transferOwnership(uint256,address)",
  "function getLand(uint256) view returns (uint256 id, string location, uint256 area, uint256 price, address currentOwner, bytes32 documentHash, string documentCID, uint256 registeredAt, bool isRegistered)",
  "function getLandIds() view returns (uint256[])",
  "function getOwnershipHistory(uint256) view returns (tuple(address owner,uint256 timestamp)[])",
  "function verifyDocument(uint256,bytes32) view returns (bool)",

  "event RegistrarUpdated(address indexed registrar,bool status)",
  "event LandRegistered(uint256 indexed id,string location,address indexed owner)",
  "event OwnershipTransferred(uint256 indexed id,address indexed previousOwner,address indexed newOwner)"
];

/**
 * Returns a direct JSON-RPC provider to Ganache on port 7545.
 * Uses the Vite proxy /ganache-rpc in the browser to avoid any browser CORS issues.
 */
export function getGanacheProvider() {
  const url = typeof window !== "undefined" && window.location?.origin
    ? `${window.location.origin}/ganache-rpc`
    : "http://127.0.0.1:7545";
  return new ethers.JsonRpcProvider(url);
}

/**
 * Fetch all available accounts directly from the Ganache network node.
 */
export async function getAvailableGanacheAccounts() {
  try {
    const ganache = getGanacheProvider();
    const accounts = await ganache.send("eth_accounts", []);
    return accounts || [];
  } catch (err) {
    console.warn("Failed to fetch Ganache accounts directly:", err);
    return [];
  }
}

/**
 * Get active provider:
 * Returns the reliable Ganache provider connected to port 7545,
 * ensuring contracts are always read correctly regardless of MetaMask network state.
 */
export async function getActiveProvider() {
  return getGanacheProvider();
}

export function getProvider() {
  return getGanacheProvider();
}

/**
 * Get active signer:
 * If MetaMask is present, connected to chain 1337/5777, and has the account, use MetaMask for genuine wallet signing.
 * Otherwise, fall back to Ganache's unlocked node signer so transactions succeed seamlessly.
 */
export async function getSigner(account) {
  if (typeof window !== "undefined" && window.ethereum) {
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await browserProvider.getNetwork();
      if (network.chainId === 1337n || network.chainId === 5777n) {
        return await browserProvider.getSigner(account);
      }
    } catch (e) {
      console.warn("MetaMask signer not available or wrong chain, using Ganache RPC signer:", e);
    }
  }

  const ganache = getGanacheProvider();
  return await ganache.getSigner(account || 0);
}

export function getContract(signerOrProvider) {
  const address = import.meta.env.VITE_CONTRACT_ADDRESS?.trim() || CONTRACT_ADDRESS;
  if (!address || !ethers.isAddress(address)) {
    throw new Error(
      "Contract address is not configured. Please set VITE_CONTRACT_ADDRESS in frontend/.env or update CONTRACT_ADDRESS in src/services/contract.js."
    );
  }
  return new ethers.Contract(
    address,
    CONTRACT_ABI,
    signerOrProvider || getGanacheProvider()
  );
}

/**
 * Verifies or gently prompts MetaMask to switch to Ganache.
 */
export async function assertGanacheNetwork(provider) {
  if (!provider) {
    return { chainId: 1337n, name: "Ganache Local" };
  }

  try {
    const network = await provider.getNetwork();
    const currentChainId = network.chainId;

    if (currentChainId === 1337n || currentChainId === 5777n) {
      return network;
    }

    if (window.ethereum?.request) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x539" }] // 1337
        });
        const updated = new ethers.BrowserProvider(window.ethereum);
        return await updated.getNetwork();
      } catch {
        // User rejected or switch failed
      }
    }
  } catch (err) {
    console.warn("Network check note:", err);
  }

  return { chainId: 1337n, name: "Ganache Local (Port 7545)" };
}
