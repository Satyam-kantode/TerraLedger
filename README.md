# TerraLedger

TerraLedger is an academic land-registry prototype. Solidity is the source of truth for land records, registrar permissions, ownership transfers, document CIDs, hashes, and ownership history. The frontend is React/Vite with ethers.js v6.

## Local setup

### 1. Start Ganache

1. Start Ganache (the desktop application is assumed below).
2. Create or open a workspace using the local RPC URL `http://127.0.0.1:7545` and chain ID `1337`.
3. Keep this workspace running. Deploying a new Ganache workspace resets its contracts and records.

### 2. Deploy the contract

1. Open `contracts/LandRegistry.sol` in Remix.
2. Select Solidity compiler `0.8.20` or newer within the `0.8.x` line, compile, and select `LandRegistry` as the contract.
3. In Remix, select **Injected Provider - MetaMask**. Connect MetaMask to the Ganache network from step 1 and select the account that should be the administrator.
4. Deploy `LandRegistry` with no constructor arguments. The deploying account is the administrator and is initially authorized to register land.
5. Copy the newly deployed contract address. Do not reuse an address from a previous Ganache workspace.

### 3. Configure and run the frontend

From PowerShell:

```powershell
cd C:\path\to\land\frontend
npm install
Copy-Item .env.example .env.local
notepad .env.local
npm run dev
```

Set `VITE_CONTRACT_ADDRESS` in `frontend/.env.local` to the address copied from Remix, then restart Vite if it was already running. The contract address is intentionally supplied through local configuration and is not embedded in source code.

In MetaMask, add a network with:

- Network name: Ganache Local
- RPC URL: `http://127.0.0.1:7545`
- Chain ID: `1337`
- Currency symbol: `ETH`

Import a Ganache account into MetaMask only for local development. Never use a real wallet or real funds with the academic prototype. Connect MetaMask in TerraLedger and confirm the app reports Ganache (1337).

### 4. Enable document storage

1. Start IPFS Desktop or a local Kubo node.
2. Ensure its API listens on `127.0.0.1:5001` and its gateway on `127.0.0.1:8081`.
3. Keep the Vite development server running; it proxies `/ipfs-api` requests to the local Kubo API.

The app requires an IPFS CID before land registration. It records that CID and the file's SHA-256 digest on-chain. IPFS content is public to anyone with the CID; do not upload private or sensitive documents. Pinning availability and gateway access depend on the local IPFS node.

## Roles and records

- The contract administrator authorizes and revokes registrar wallets from **Registrar Access**.
- Only authorized registrars can register land. The contract deployer is authorized initially.
- The current owner alone can transfer a land record to a valid new wallet address.
- Land IDs are assigned sequentially on-chain. Ownership history is stored on-chain and starts with the registered owner.
- Price is entered in ETH and stored in wei; area is recorded in whole square meters.
- Document verification compares the selected file's SHA-256 digest with the digest stored for the land ID. The IPFS verification action fetches the CID stored on-chain and verifies the retrieved file the same way.
- A confirmed transaction is shown only after ethers.js `tx.wait()` returns.

## Author

Developed by **Satyam Kantode**
GitHub: [https://github.com/Satyam-kantode](https://github.com/Satyam-kantode)


Ganache is ephemeral by design. Restarting it with a new workspace requires redeploying the contract and updating `VITE_CONTRACT_ADDRESS`; previous records are not carried over.

## Checks

Run from `frontend`:

```powershell
npm run lint
npm run build
```
