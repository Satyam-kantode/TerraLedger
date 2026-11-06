import React, { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ethers } from "ethers";

import {
  assertGanacheNetwork,
  EXPECTED_CHAIN_ID,
  CONTRACT_ADDRESS,
  getActiveProvider,
  getProvider,
  getSigner,
  getContract
} from "./services/contract";

import {
  checkIPFSConnection,
  uploadToIPFS,
  fetchFileFromIPFS,
  LOCAL_GATEWAY,
  PUBLIC_GATEWAY
} from "./services/ipfs";

import "./App.css";

function parseProperty(result) {
  return {
    id: Number(result.id ?? result[0]),
    location: result.location ?? result[1],
    area: Number(result.area ?? result[2]),
    price: ethers.formatEther(result.price ?? result[3]),
    owner: result.currentOwner ?? result[4],
    documentHash: result.documentHash ?? result[5],
    documentCID: result.documentCID ?? result[6],
    registeredAt: Number(result.registeredAt ?? result[7]),
    isRegistered: result.isRegistered ?? result[8]
  };
}

function getErrorMessage(error, fallback) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") {
    return "The wallet request was rejected.";
  }
  return error?.reason || error?.shortMessage || error?.message || fallback;
}

function App() {
  const [account, setAccount] = useState("");
  const [network, setNetwork] = useState("Ganache Local (127.0.0.1:7545 | 1337)");
  const [connected, setConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [totalProperties, setTotalProperties] = useState(0);
  const [properties, setProperties] = useState([]);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [admin, setAdmin] = useState("");
  const [isRegistrar, setIsRegistrar] = useState(false);
  const [registrarAddress, setRegistrarAddress] = useState("");

  const [location, setLocation] = useState("");
  const [area, setArea] = useState("");
  const [price, setPrice] = useState("");
  const [owner, setOwner] = useState("");
  const [documentFile, setDocumentFile] = useState(null);
  const [documentHash, setDocumentHash] = useState("");

  const [searchId, setSearchId] = useState("");
  const [property, setProperty] = useState(null);

  const [history, setHistory] = useState([]);

  const [transferId, setTransferId] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const [verifyId, setVerifyId] = useState("");
  const [verifyFile, setVerifyFile] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);

  const [transactionHash, setTransactionHash] = useState("");
  const [transactionStatus, setTransactionStatus] = useState("");

  const [loading, setLoading] = useState(false);

  const [activeSection, setActiveSection] = useState("dashboard");

  const [ipfsStatus, setIpfsStatus] = useState({ online: false, version: null });
  const [documentCid, setDocumentCid] = useState("");
  const [ipfsUploading, setIpfsUploading] = useState(false);
  const [propertyCid, setPropertyCid] = useState("");
  const [verificationCid, setVerificationCid] = useState("");
  const [qrMode, setQrMode] = useState("app");
  const [mobileHost, setMobileHost] = useState("192.168.9.37");
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS?.trim() || CONTRACT_ADDRESS;
  const filteredProperties = properties.filter((item) => {
    const query = propertyFilter.trim().toLowerCase();
    return !query || [
      String(item.id),
      item.location,
      item.owner
    ].some((value) => value.toLowerCase().includes(query));
  });

  /* =========================
     HELPER FUNCTIONS
  ========================= */

  const getMobileVerificationUrl = (propertyId) => {
    const port = window.location.port ? `:${window.location.port}` : "";
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const host = isLocal ? mobileHost : window.location.hostname;
    return `${window.location.protocol}//${host}${port}/?property=${propertyId}`;
  };

  const getMobileDeedUrl = (cid) => {
    const port = window.location.port ? `:${window.location.port}` : "";
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const host = isLocal ? mobileHost : window.location.hostname;
    return `${window.location.protocol}//${host}${port}/ipfs/${cid}`;
  };

  const shorten = (address) => {
    if (!address) return "-";

    return (
      address.substring(0, 6) +
      "..." +
      address.substring(address.length - 4)
    );
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "-";

    return new Date(
      Number(timestamp) * 1000
    ).toLocaleString();
  };

  /* =========================
     SHA-256
  ========================= */

  const calculateSHA256 = async (file) => {
    if (!globalThis.crypto?.subtle) {
      throw new Error("Secure SHA-256 is unavailable. Open TerraLedger on localhost or HTTPS.");
    }
    const buffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      buffer
    );

    const hashArray = Array.from(
      new Uint8Array(hashBuffer)
    );

    const hashHex = hashArray
      .map((byte) =>
        byte.toString(16).padStart(2, "0")
      )
      .join("");

    return "0x" + hashHex;
  };

  const showError = useCallback((error, fallback) => {
    console.error(error);
    setSuccessMessage("");
    setErrorMessage(getErrorMessage(error, fallback));
  }, []);

  /* =========================
     CONNECT & SWITCH WALLET
  ========================= */

  const disconnectWallet = async () => {
    setAccount("");
    setConnected(false);
    setIsRegistrar(false);
    setSuccessMessage("Wallet disconnected.");
    setErrorMessage("");

    if (window.ethereum) {
      try {
        await window.ethereum.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }]
        });
      } catch (e) {
        // Revoke if supported
      }
    }
  };

  const switchAccount = async () => {
    try {
      setErrorMessage("");
      if (!window.ethereum) return;

      let accounts = [];
      try {
        const perms = await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }]
        });
        const caveat = perms?.[0]?.caveats?.find((c) => Array.isArray(c.value));
        if (caveat && caveat.value.length > 0) {
          accounts = caveat.value;
        }
      } catch (permErr) {
        if (permErr?.code === 4001) {
          return;
        }
      }

      if (!accounts || accounts.length === 0) {
        accounts = await window.ethereum.request({ method: "eth_accounts" });
      }

      if (accounts && accounts.length > 0) {
        const currentSelected = window.ethereum.selectedAddress;
        const activeAccount = (currentSelected && accounts.find((a) => a.toLowerCase() === currentSelected.toLowerCase()))
          || accounts[0];

        setAccount(activeAccount);
        setConnected(true);
        await loadBlockchainData(activeAccount);
        setSuccessMessage(`Switched to ${shorten(activeAccount)}`);
      }
    } catch (err) {
      if (err?.code !== 4001) {
        showError(err, "Could not switch MetaMask account.");
      }
    }
  };

  const connectWallet = async () => {
    try {
      setErrorMessage("");
      if (!window.ethereum) {
        alert("MetaMask extension is not detected. Please install MetaMask to continue.");
        return;
      }

      // 1. Request accounts from MetaMask with popup picker
      let accounts = [];
      try {
        const perms = await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }]
        });
        const caveat = perms?.[0]?.caveats?.find((c) => Array.isArray(c.value));
        if (caveat && caveat.value.length > 0) {
          accounts = caveat.value;
        }
      } catch (permErr) {
        if (permErr?.code === 4001) {
          throw new Error("MetaMask connection was canceled by user.");
        }
      }

      if (!accounts || accounts.length === 0) {
        accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      }

      if (!accounts || accounts.length === 0) {
        accounts = await window.ethereum.request({ method: "eth_accounts" });
      }

      if (!accounts || accounts.length === 0) {
        throw new Error("No account was returned by MetaMask.");
      }

      // 2. Identify the exact account currently open / active in MetaMask
      const currentSelected = window.ethereum.selectedAddress;
      const activeAccount = (currentSelected && accounts.find((a) => a.toLowerCase() === currentSelected.toLowerCase()))
        || accounts[0];

      // 3. Trigger genuine MetaMask confirmation popup window on screen
      try {
        const signMsg = `Confirm connection to TerraLedger Land Registry\n\nAccount: ${activeAccount}\nNetwork: Ganache (Chain ID 1337)\nTime: ${new Date().toLocaleTimeString()}`;
        await window.ethereum.request({
          method: "personal_sign",
          params: [signMsg, activeAccount]
        });
      } catch (signErr) {
        if (signErr?.code === 4001 || signErr?.code === "ACTION_REJECTED") {
          throw new Error("Connection canceled in MetaMask.");
        }
      }

      setAccount(activeAccount);
      setConnected(true);

      // 4. Verify and prompt Ganache network switch
      try {
        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (chainId !== "0x539" && chainId !== "0x1691") {
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: "0x539" }] // 1337
            });
          } catch (switchError) {
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [{
                  chainId: "0x539",
                  chainName: "Ganache Local",
                  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                  rpcUrls: ["http://127.0.0.1:7545"]
                }]
              });
            }
          }
        }
      } catch {}

      setNetwork("Ganache Local (127.0.0.1:7545 | 1337)");
      await loadBlockchainData(activeAccount);
      setSuccessMessage(`Connected: ${shorten(activeAccount)}`);
    } catch (error) {
      showError(error, "MetaMask connection was not completed.");
    }
  };

  /* =========================
     LOAD BLOCKCHAIN DATA
  ========================= */

  const loadBlockchainData = useCallback(async (wallet) => {
    try {
      const provider = await getActiveProvider();
      const contract = getContract(provider);
      const [count, contractAdmin, ids] = await Promise.all([
        contract.propertyCount(),
        contract.admin(),
        contract.getLandIds()
      ]);
      const landResults = await Promise.all(
        ids.map((id) => contract.getLand(id))
      );
      setTotalProperties(Number(count));
      setAdmin(contractAdmin);
      setProperties(landResults.map(parseProperty));
      const currentWallet = wallet || account;
      if (currentWallet) {
        const isReg = await contract.registrars(currentWallet);
        setIsRegistrar(isReg || currentWallet.toLowerCase() === contractAdmin.toLowerCase());
      } else {
        setIsRegistrar(false);
      }
      setNetwork(`Ganache Local (127.0.0.1:7545 | 1337)`);
    } catch (err) {
      console.error("Blockchain load error:", err);
      setNetwork(`Ganache Local (127.0.0.1:7545 | 1337)`);
    }
  }, [account]);

  const refreshBlockchainData = useCallback(async (wallet) => {
    try {
      await loadBlockchainData(wallet);
    } catch (error) {
      showError(error, "Could not refresh land records from the blockchain.");
    }
  }, [loadBlockchainData, showError]);

  /* =========================
     DOCUMENT SELECT
  ========================= */

  const handleDocumentSelect =
    async (event) => {
      const file =
        event.target.files[0];

      if (!file) {
        setDocumentFile(null);
        setDocumentHash("");
        setDocumentCid("");
        return;
      }

      if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
        event.target.value = "";
        showError(new Error("Use a PDF, PNG, or JPEG land document."));
        return;
      }

      setDocumentFile(file);
      setDocumentCid("");
      setErrorMessage("");

      try {
        const hash =
          await calculateSHA256(file);

        setDocumentHash(hash);
        setIpfsUploading(true);
        const ipfsRes = await uploadToIPFS(file);
        setDocumentCid(ipfsRes.cid);
      } catch (error) {
        setDocumentCid("");
        showError(error, "Could not hash or upload this document.");
      } finally {
        setIpfsUploading(false);
      }
    };

  /* =========================
     REGISTER PROPERTY
  ========================= */

  const registerProperty =
    async () => {
      try {
        setErrorMessage("");
        setSuccessMessage("");
        if (!connected) {
          throw new Error("Connect MetaMask to register land.");
        }
        if (!isRegistrar) {
          throw new Error("Only an authorized registrar can register land. Ask the administrator to authorize your wallet.");
        }
        if (!location.trim()) {
          throw new Error("Enter the land location.");
        }
        if (!area || !Number.isSafeInteger(Number(area)) || Number(area) <= 0) {
          throw new Error("Area must be a positive whole number of square meters.");
        }
        if (!price.trim()) {
          throw new Error("Enter the land price in ETH (use 0 if it is not being valued).");
        }
        if (!ethers.isAddress(owner)) {
          throw new Error("Enter a valid owner wallet address.");
        }
        if (!documentFile || !documentHash) {
          throw new Error("Select a land document to calculate its SHA-256 hash.");
        }
        if (!documentCid) {
          throw new Error("The document must be uploaded to IPFS before registration. Check that IPFS Desktop/Kubo is running.");
        }
        let weiPrice;
        try {
          weiPrice = ethers.parseEther(price.trim());
        } catch {
          throw new Error("Price must be a non-negative ETH amount with up to 18 decimal places.");
        }
        if (weiPrice < 0n) {
          throw new Error("Price cannot be negative.");
        }
        setLoading(true);
        setTransactionHash("");
        setTransactionStatus("");
        const signer = await getSigner(account);
        const contract = getContract(signer);
        const hash = await calculateSHA256(documentFile);
        setDocumentHash(hash);
        const tx = await contract.registerLand(
          location.trim(),
          BigInt(area),
          weiPrice,
          owner,
          hash,
          documentCid
        );
        setTransactionHash(tx.hash);
        setTransactionStatus("pending");
        const receipt = await tx.wait();
        const registrationLog = receipt.logs
          .filter((log) => log.address.toLowerCase() === contract.target.toLowerCase())
          .map((log) => {
            try {
              return contract.interface.parseLog(log);
            } catch {
              return null;
            }
          })
          .find((log) => log?.name === "LandRegistered");
        const registeredId = Number(
          registrationLog?.args.id ?? await contract.propertyCount()
        );
        setTransactionStatus("confirmed");
        setSuccessMessage(`Land #${registeredId} registered and confirmed on-chain.`);
        setLocation("");
        setArea("");
        setPrice("");
        setOwner("");
        setDocumentFile(null);
        setDocumentHash("");
        setDocumentCid("");
        await refreshBlockchainData(account);
      } catch (error) {
        setTransactionStatus((status) => status === "pending" ? "failed" : status);
        showError(error, "Land registration failed.");
      } finally {
        setLoading(false);
      }
    };

  /* =========================
     GET PROPERTY
  ========================= */

  const getPropertyDetails =
    async () => {
      try {
        const id = Number(searchId);
        if (!Number.isSafeInteger(id) || id <= 0) {
          throw new Error("Enter a valid positive land ID.");
        }
        const provider = await getActiveProvider();
        const contract = getContract(provider);
        const [result, historyResult] = await Promise.all([
          contract.getLand(id),
          contract.getOwnershipHistory(id)
        ]);
        const data = parseProperty(result);
        setProperty(data);
        setPropertyCid(data.documentCID);
        setHistory(historyResult.map((item) => ({
          owner: item.owner ?? item[0],
          timestamp: Number(item.timestamp ?? item[1])
        })));
        setErrorMessage("");
      } catch (error) {
        setProperty(null);
        setPropertyCid("");
        showError(error, "Land record could not be loaded.");
      }
    };

  /* =========================
     OWNERSHIP HISTORY
  ========================= */

  const getHistory =
    async () => {
      try {
        const id = Number(searchId);
        if (!Number.isSafeInteger(id) || id <= 0) {
          throw new Error("Enter a valid positive land ID.");
        }
        const provider = await getActiveProvider();
        const contract = getContract(provider);
        const result = await contract.getOwnershipHistory(id);
        setHistory(result.map((item) => ({
          owner: item.owner ?? item[0],
          timestamp: Number(item.timestamp ?? item[1])
        })));
        setErrorMessage("");
      } catch (error) {
        showError(error, "Could not load ownership history.");
      }
    };

  /* =========================
     TRANSFER OWNERSHIP
  ========================= */

  const transferOwnership =
    async () => {
      try {
        setErrorMessage("");
        setSuccessMessage("");
        if (!connected) {
          throw new Error("Connect MetaMask to transfer ownership.");
        }
        const id = Number(transferId);
        if (!Number.isSafeInteger(id) || id <= 0) {
          throw new Error("Enter a valid positive land ID.");
        }
        if (!ethers.isAddress(newOwner)) {
          throw new Error("Enter a valid new owner wallet address.");
        }
        setLoading(true);
        setTransactionHash("");
        setTransactionStatus("");
        const signer = await getSigner(account);
        const contract = getContract(signer);
        const tx = await contract.transferOwnership(id, newOwner);
        setTransactionHash(tx.hash);
        setTransactionStatus("pending");
        await tx.wait();
        setTransactionStatus("confirmed");
        setSuccessMessage(`Ownership transfer for land #${id} confirmed on-chain.`);
        setTransferId("");
        setNewOwner("");
        await refreshBlockchainData(account);
      } catch (error) {
        setTransactionStatus((status) => status === "pending" ? "failed" : status);
        showError(error, "Ownership transfer failed.");
      } finally {
        setLoading(false);
      }
    };

  const updateRegistrar = async (authorize) => {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      if (!connected) {
        throw new Error("Connect the administrator wallet first.");
      }
      if (account.toLowerCase() !== admin.toLowerCase()) {
        throw new Error("Only the contract administrator can manage registrars.");
      }
      if (!ethers.isAddress(registrarAddress)) {
        throw new Error("Enter a valid registrar wallet address.");
      }

      setLoading(true);
      setTransactionHash("");
      setTransactionStatus("");
      const signer = await getSigner(account);
      const contract = getContract(signer);
      const tx = authorize
        ? await contract.addRegistrar(registrarAddress)
        : await contract.removeRegistrar(registrarAddress);
      setTransactionHash(tx.hash);
      setTransactionStatus("pending");
      await tx.wait();
      setTransactionStatus("confirmed");
      setSuccessMessage(
        `${registrarAddress} ${authorize ? "authorized" : "revoked"} successfully.`
      );
      setRegistrarAddress("");
      await refreshBlockchainData(account);
    } catch (error) {
      setTransactionStatus((status) => status === "pending" ? "failed" : status);
      showError(error, "Could not update registrar access.");
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     VERIFY DOCUMENT
  ========================= */

  const verifyDocument =
    async () => {
      try {
        const id = Number(verifyId);
        if (!Number.isSafeInteger(id) || id <= 0) {
          throw new Error("Enter a valid positive land ID.");
        }
        if (!verifyFile) {
          throw new Error("Choose the document file to verify.");
        }
        setErrorMessage("");
        setVerificationResult(null);
        setLoading(true);
        const hash = await calculateSHA256(verifyFile);
        const provider = await getActiveProvider();
        const contract = getContract(provider);
        const result = await contract.verifyDocument(id, hash);
        setVerificationResult({ valid: result, hash });
      } catch (error) {
        setVerificationResult(null);
        showError(error, "Document verification failed.");
      } finally {
        setLoading(false);
      }
    };

  /* =========================
     VERIFY IPFS DOCUMENT
  ========================= */

  const verifyIPFSDocument = async () => {
    try {
      const id = Number(verifyId);
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("Enter a valid positive land ID.");
      }
      setErrorMessage("");
      setVerificationResult(null);
      setLoading(true);
      const provider = await getActiveProvider();
      const contract = getContract(provider);
      const land = await contract.getLand(id);
      const cid = land.documentCID ?? land[6];
      if (!cid) {
        throw new Error(`No IPFS document CID is stored on-chain for land #${id}.`);
      }
      setVerificationCid(cid);
      const blob = await fetchFileFromIPFS(cid);
      const hash = await calculateSHA256(blob);
      const result = await contract.verifyDocument(id, hash);
      setVerificationResult({ valid: result, hash, fromIPFS: true, cid });
    } catch (error) {
      setVerificationResult(null);
      showError(error, "Could not fetch and verify the on-chain IPFS document.");
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     METAMASK EVENT LISTENERS
  ========================= */

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (!accounts || accounts.length === 0) {
        setAccount("");
        setConnected(false);
        setIsRegistrar(false);
      } else {
        const currentSelected = window.ethereum.selectedAddress;
        const activeAccount = (currentSelected && accounts.find((a) => a.toLowerCase() === currentSelected.toLowerCase()))
          || accounts[0];
        setAccount(activeAccount);
        setConnected(true);
        refreshBlockchainData(activeAccount);
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [refreshBlockchainData]);

  /* =========================
     AUTO LOAD BLOCKCHAIN
  ========================= */

  useEffect(() => {
    loadBlockchainData();
  }, [loadBlockchainData]);

  /* =========================
     IPFS STATUS MONITOR
  ========================= */

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      try {
        const res = await checkIPFSConnection();
        if (mounted) {
          setIpfsStatus(res);
        }
      } catch {
        if (mounted) {
          setIpfsStatus({ online: false, version: null, mode: null });
        }
      }
    };

    checkStatus();
    const timer = setInterval(checkStatus, 8000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  /* =========================
     PUBLIC VERIFICATION
  ========================= */

  useEffect(() => {

    const params =
      new URLSearchParams(
        window.location.search
      );

    const id =
      params.get("property");

    if (id) {

      setSearchId(id);
      setVerifyId(id);
      setActiveSection(
        "verification"
      );

    }

  }, []);

  /* =========================
     UI
  ========================= */

  return (

    <div className="app">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="logo">

          <div className="logo-icon">
            TL
          </div>

          <div>
            <h2>TerraLedger</h2>
            <span>Blockchain Registry</span>
          </div>

        </div>

        <nav>

          <button
            className={
              activeSection === "dashboard"
                ? "nav-active"
                : ""
            }
            onClick={() =>
              setActiveSection(
                "dashboard"
              )
            }
          >
            Dashboard
          </button>

          <button
            onClick={() =>
              setActiveSection(
                "register"
              )
            }
          >
            Register Property
          </button>

          <button
            onClick={() =>
              setActiveSection(
                "verification"
              )
            }
          >
            Verification Center
          </button>

          <button
            onClick={() =>
              setActiveSection(
                "history"
              )
            }
          >
            Ownership History
          </button>

          <button
            onClick={() =>
              setActiveSection(
                "transfer"
              )
            }
          >
            Transfer Ownership
          </button>

          <button
            onClick={() =>
              setActiveSection(
                "certificate"
              )
            }
          >
            Property Certificate
          </button>

          {account && account.toLowerCase() === admin.toLowerCase() && (
            <button
              className={activeSection === "admin" ? "nav-active" : ""}
              onClick={() => setActiveSection("admin")}
            >
              Registrar Access
            </button>
          )}

        </nav>

        <div className="sidebar-bottom">

          <div className="network-small">
            <span className="dot"></span>
            Ganache Local Network
          </div>

          <div className="network-small" style={{ marginTop: "8px" }}>
            <span
              className="dot"
              style={{
                background: ipfsStatus.online ? "#10b981" : "#f59e0b",
                boxShadow: ipfsStatus.online
                  ? "0 0 6px #10b981"
                  : "0 0 6px #f59e0b"
              }}
            ></span>
            {ipfsStatus.online
              ? `IPFS: Connected (${ipfsStatus.version || "Online"})`
              : "IPFS Desktop: Offline"}
          </div>

          <div className="contract-small">
            Contract
            <br />
            {contractAddress ? shorten(contractAddress) : "Not configured"}
          </div>

          {errorMessage && (
            <div className="notice error-notice" role="alert">
              {errorMessage}
              <button type="button" onClick={() => setErrorMessage("")} aria-label="Dismiss error">×</button>
            </div>
          )}

          {successMessage && (
            <div className="notice success-notice" role="status">
              {successMessage}
            </div>
          )}

        </div>

      </aside>

      {/* MAIN */}

      <main className="main">

        {/* HEADER */}

        <header className="header">

          <div>

            <p className="eyebrow">
              DECENTRALIZED LAND REGISTRY
            </p>

            <h1>
              TerraLedger
            </h1>

          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {!connected ? (
              <button
                className="connect-btn"
                onClick={connectWallet}
                title="Connect with MetaMask wallet"
              >
                🦊 Connect MetaMask
              </button>
            ) : (
              <>
                <button
                  className="connect-btn"
                  onClick={switchAccount}
                  title="Click to switch account in MetaMask"
                >
                  🦊 {shorten(account)} ({account.toLowerCase() === admin.toLowerCase() ? "Admin" : isRegistrar ? "Registrar" : "User"})
                </button>
                <button
                  type="button"
                  onClick={disconnectWallet}
                  style={{
                    background: "transparent",
                    border: "1px solid #cbd5e1",
                    color: "#64748b",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Disconnect
                </button>
              </>
            )}
          </div>

        </header>

        {/* STATUS */}

        <div className="status-bar">

          <div>
            <span className="green-dot"></span>

            {connected
              ? "Wallet Connected"
              : "Wallet Not Connected"}
          </div>

          <div>
            Network:{" "}
            {network || "Not connected"}
          </div>

          <div>
            Role:{" "}
            {account &&
            account.toLowerCase() ===
              admin.toLowerCase()
              ? "Admin"
              : isRegistrar
              ? "Registrar"
              : "User"}
          </div>

          <div>
            IPFS:{" "}
            <span
              style={{
                color: ipfsStatus.online ? "#10b981" : "#f59e0b",
                fontWeight: 700
              }}
            >
              {ipfsStatus.online ? "● Connected (Port 5001)" : "○ Offline (Start IPFS)"}
            </span>
          </div>

        </div>

        {/* =====================
            DASHBOARD
        ====================== */}

        {activeSection ===
          "dashboard" && (

          <>

            <section className="hero">

              <div>

                <p className="hero-label">
                  BLOCKCHAIN POWERED
                </p>

                <h2>
                  Secure land records.
                  <br />
                  Verified forever.
                </h2>

                <p>
                  TerraLedger provides
                  transparent property
                  registration, ownership
                  tracking and cryptographic
                  document verification.
                </p>

              </div>

              <div className="hero-chain">

                <div>BLOCKCHAIN</div>

                <strong>
                  SHA-256
                </strong>

                <span>
                  Immutable Records
                </span>

              </div>

            </section>

            <section className="stats">

              <div className="stat-card">

                <span>
                  REGISTERED LANDS
                </span>

                <strong>
                  {totalProperties}
                </strong>

              </div>

              <div className="stat-card">

                <span>
                  MY LAND RECORDS
                </span>

                <strong>
                  {properties.filter(
                    (item) => account && item.owner.toLowerCase() === account.toLowerCase()
                  ).length}
                </strong>

              </div>

              <div className="stat-card">

                <span>
                  NETWORK
                </span>

                <strong>
                  {network || `Chain ${EXPECTED_CHAIN_ID}`}
                </strong>

              </div>

              <div className="stat-card">

                <span>
                  REGISTRARS
                </span>

                <strong>
                  {isRegistrar ? "AUTHORIZED" : "READ ONLY"}
                </strong>

              </div>

            </section>

            <section className="panel">

              <div className="panel-header">

                <div>

                  <p className="eyebrow">
                    QUICK ACCESS
                  </p>

                  <h2>
                    Property Verification
                  </h2>

                </div>

              </div>

              <div className="search-row">

                <input
                  placeholder="Enter Property ID"
                  value={searchId}
                  onChange={(e) =>
                    setSearchId(
                      e.target.value
                    )
                  }
                />

                <button
                  onClick={
                    getPropertyDetails
                  }
                >
                  Search Property
                </button>

              </div>

              {property && (

                <div className="property-result">

                  <div>
                    <span>
                      PROPERTY ID
                    </span>

                    <strong>
                      #{property.id}
                    </strong>
                  </div>

                  <div>
                    <span>
                      LOCATION
                    </span>

                    <strong>
                      {property.location}
                    </strong>
                  </div>

                  <div>
                    <span>
                      AREA
                    </span>

                    <strong>
                      {property.area}
                    </strong>
                  </div>

                  <div>
                    <span>
                      OWNER
                    </span>

                    <strong title={property.owner}>
                      {property.owner}
                    </strong>
                  </div>

                  <div>
                    <span>PRICE (ETH)</span>
                    <strong>{property.price}</strong>
                  </div>

                  <div>
                    <span>REGISTRATION STATUS</span>
                    <strong>{property.isRegistered ? "Registered" : "Not registered"}</strong>
                  </div>

                  <div>
                    <span>DOCUMENT CID</span>
                    <strong className="truncate">{property.documentCID || "Unavailable"}</strong>
                  </div>

                </div>

              )}

            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">ON-CHAIN RECORDS</p>
                  <h2>Land register</h2>
                </div>
                <span>{properties.length} total</span>
              </div>
              <div className="search-row">
                <input
                  aria-label="Filter land records"
                  placeholder="Filter by ID, location or owner address"
                  value={propertyFilter}
                  onChange={(event) => setPropertyFilter(event.target.value)}
                />
              </div>
              {filteredProperties.length ? (
                <div className="land-list">
                  {filteredProperties.map((item) => (
                    <button
                      type="button"
                      className="land-row"
                      key={item.id}
                      onClick={() => {
                        setSearchId(String(item.id));
                        setProperty(item);
                        setPropertyCid(item.documentCID);
                        setHistory([]);
                      }}
                    >
                      <span className="land-id">#{item.id}</span>
                      <span>{item.location}</span>
                      <span>{item.area} m²</span>
                      <span>{shorten(item.owner)}</span>
                      <span>{item.price} ETH</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="empty">
                  {properties.length ? "No land records match this filter." : "No land records have been registered on this contract yet."}
                </p>
              )}
            </section>

          </>

        )}

        {/* =====================
            REGISTER
        ====================== */}

        {activeSection ===
          "register" && (

          <section className="panel">

            <div className="section-title">

              <p className="eyebrow">
                BLOCKCHAIN REGISTRATION
              </p>

              <h2>
                Register New Property
              </h2>

              <p>
                Land registration is available only to wallets authorized by the contract administrator.
              </p>

            </div>

            {!connected && (
              <p className="empty">Connect MetaMask on Ganache (chain ID 1337) before registering.</p>
            )}
            {connected && !isRegistrar && (
              <p className="empty">This wallet is not an authorized registrar. Ask the administrator to grant registrar access.</p>
            )}

            <div className="form-grid">

              <div className="field">

                <label>
                  Location
                </label>

                <input
                  placeholder="Worli, Mumbai"
                  value={location}
                  onChange={(e) =>
                    setLocation(
                      e.target.value
                    )
                  }
                />

              </div>

              <div className="field">

                <label>
                  Area (m²)
                </label>

                <input
                  type="number"
                  placeholder="1000"
                  min="1"
                  step="1"
                  value={area}
                  onChange={(e) =>
                    setArea(
                      e.target.value
                    )
                  }
                />

              </div>

              <div className="field">
                <label>Price (ETH)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>

              <div className="field full">

                <label>
                  Owner Wallet Address
                </label>

                <input
                  placeholder="0x..."
                  value={owner}
                  onChange={(e) =>
                    setOwner(
                      e.target.value
                    )
                  }
                />

              </div>

              <div className="field full">

                <label>
                  Land Document (uploaded to IPFS and hashed with SHA-256)
                </label>

                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  disabled={ipfsUploading || loading}
                  onChange={
                    handleDocumentSelect
                  }
                />

              </div>

            </div>

            {documentHash && (

              <div className="hash-card">

                <div>
                  <strong>
                    🔐 SHA-256 DOCUMENT FINGERPRINT
                  </strong>

                  <p>
                    This cryptographic fingerprint will
                    be permanently recorded on the blockchain.
                  </p>
                </div>

                <code>
                  {documentHash}
                </code>

              </div>

            )}

            {ipfsUploading && (

              <div className="hash-card" style={{ borderColor: "#0284c7", background: "rgba(2, 132, 199, 0.05)" }}>

                <div>
                  <strong style={{ color: "#0284c7" }}>
                    ⏳ UPLOADING TO IPFS NODE...
                  </strong>

                  <p>
                    Connecting to local IPFS (Kubo) daemon and pinning document...
                  </p>
                </div>

              </div>

            )}

            {documentCid && (

              <div className="hash-card" style={{ borderColor: "#0284c7", background: "rgba(2, 132, 199, 0.08)" }}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ color: "#0284c7" }}>
                      🌐 IPFS CONTENT IDENTIFIER (CID)
                    </strong>

                    <p>
                      Document uploaded & pinned on decentralized IPFS.
                    </p>
                  </div>

                  <span style={{ fontSize: "11px", fontWeight: "bold", background: "#0284c7", color: "white", padding: "3px 8px", borderRadius: "5px" }}>
                    PINNED ON IPFS
                  </span>
                </div>

                <code>
                  {documentCid}
                </code>

                <div style={{ marginTop: "12px", display: "flex", gap: "15px", fontSize: "12px" }}>
                  <a
                    href={`http://127.0.0.1:8081/ipfs/${documentCid}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#0284c7", fontWeight: 700, textDecoration: "underline" }}
                  >
                    View on Local IPFS Gateway ↗
                  </a>

                  <a
                    href={`${PUBLIC_GATEWAY}/${documentCid}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#64748b", textDecoration: "underline" }}
                  >
                    Public IPFS Gateway ↗
                  </a>
                </div>

              </div>

            )}

            {!ipfsStatus.online && documentFile && !documentCid && !ipfsUploading && (

              <div style={{ marginTop: "12px", padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", fontSize: "12px", color: "#92400e" }}>
                💡 <strong>IPFS Tip:</strong> Launch IPFS Desktop to automatically store and pin this document to IPFS on upload.
              </div>

            )}

            <button
              className="primary-btn"
              onClick={
                registerProperty
              }
              disabled={loading || ipfsUploading || !connected || !isRegistrar}
            >
              {loading
                ? "Processing..."
                : "Register Land"}
            </button>

          </section>

        )}

        {/* =====================
            VERIFICATION
        ====================== */}

        {activeSection ===
          "verification" && (

          <section className="panel">

            <div className="section-title">

              <p className="eyebrow">
                DOCUMENT SECURITY
              </p>

              <h2>
                Verification Center
              </h2>

              <p>
                Upload a document and
                compare its SHA-256
                fingerprint with the
                blockchain record.
              </p>

            </div>

            <div className="form-grid">

              <div className="field">

                <label>
                  Property ID
                </label>

                <input
                  type="number"
                  placeholder="1"
                  value={verifyId}
                  onChange={(e) => {
                    setVerifyId(e.target.value);
                    setVerificationCid("");
                    setVerificationResult(null);
                  }}
                />

              </div>

              <div className="field">

                <label>
                  Upload Document
                </label>

                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  disabled={loading}
                  onChange={(event) => {
                    const file = event.target.files[0];
                    if (file && !/\.(pdf|png|jpe?g)$/i.test(file.name)) {
                      event.target.value = "";
                      setVerifyFile(null);
                      showError(new Error("Use a PDF, PNG, or JPEG document to verify."));
                      return;
                    }
                    setVerifyFile(file || null);
                    setVerificationResult(null);
                  }}
                />

              </div>

            </div>

            <div className="hash-card">
              <strong>On-chain IPFS document</strong>
              <p>The CID is read from the land record, then the fetched file is checked against its on-chain SHA-256 hash.</p>
              {verificationCid && (
                <>
                  <code>{verificationCid}</code>
                  <a
                    href={`${LOCAL_GATEWAY}/${verificationCid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-link"
                  >
                    Open document on local IPFS gateway
                  </a>
                </>
              )}
              <button
                type="button"
                onClick={verifyIPFSDocument}
                disabled={loading}
                className="secondary-btn"
              >
                {loading ? "Fetching and verifying..." : "Fetch and verify stored IPFS document"}
              </button>
            </div>

            <button
              className="primary-btn"
              onClick={
                verifyDocument
              }
              disabled={loading}
            >
              {loading
                ? "Checking..."
                : "Verify Uploaded Document"}
            </button>

            {verificationResult && (

              <div
                className={
                  verificationResult.valid
                    ? "verification success"
                    : "verification danger"
                }
              >

                <div className="verification-icon">

                  {verificationResult.valid
                    ? "✓"
                    : "✕"}

                </div>

                <div>

                  <h3>

                    {verificationResult.valid
                      ? "DOCUMENT AUTHENTIC"
                      : "DOCUMENT TAMPERED"}

                  </h3>

                  <p>

                    {verificationResult.valid
                      ? "The uploaded document matches the hash stored on the blockchain."
                      : "The uploaded document does not match the blockchain fingerprint."}

                  </p>

                  {verificationResult.hash && (

                    <code>
                      {verificationResult.hash}
                    </code>

                  )}

                </div>

              </div>

            )}

          </section>

        )}

        {/* =====================
            HISTORY
        ====================== */}

        {activeSection ===
          "history" && (

          <section className="panel">

            <div className="section-title">

              <p className="eyebrow">
                IMMUTABLE RECORD
              </p>

              <h2>
                Ownership Timeline
              </h2>

            </div>

            <div className="search-row">

              <input
                type="number"
                placeholder="Property ID"
                value={searchId}
                onChange={(e) =>
                  setSearchId(
                    e.target.value
                  )
                }
              />

              <button
                onClick={getHistory}
              >
                Load Timeline
              </button>

            </div>

            <div className="timeline">

              {history.length === 0 && (

                <div className="empty">
                  No ownership history loaded.
                </div>

              )}

              {history.map(
                (item, index) => (

                  <div
                    className="timeline-item"
                    key={index}
                  >

                    <div className="timeline-dot">
                      {index + 1}
                    </div>

                    <div>

                      <span>
                        {index === 0
                          ? "PROPERTY REGISTERED"
                          : "OWNERSHIP TRANSFERRED"}
                      </span>

                      <h3>
                        {shorten(
                          item.owner
                        )}
                      </h3>

                      <p>
                        {formatDate(
                          item.timestamp
                        )}
                      </p>

                    </div>

                  </div>

                )
              )}

            </div>

          </section>

        )}

        {/* =====================
            TRANSFER
        ====================== */}

        {activeSection ===
          "transfer" && (

          <section className="panel">

            <div className="section-title">

              <p className="eyebrow">
                OWNERSHIP MANAGEMENT
              </p>

              <h2>
                Transfer Ownership
              </h2>

              <p>
                Only the current owner wallet can authorize this ownership transfer. The contract enforces this rule.
              </p>

            </div>

            <div className="form-grid">

              <div className="field">

                <label>
                  Property ID
                </label>

                <input
                  type="number"
                  value={transferId}
                  onChange={(e) =>
                    setTransferId(
                      e.target.value
                    )
                  }
                />

              </div>

              <div className="field">

                <label>
                  New Owner
                </label>

                <input
                  placeholder="0x..."
                  value={newOwner}
                  onChange={(e) =>
                    setNewOwner(
                      e.target.value
                    )
                  }
                />

              </div>

            </div>

            <button
              className="primary-btn"
              onClick={
                transferOwnership
              }
              disabled={loading}
            >
              {loading
                ? "Processing..."
                : "Transfer Ownership"}
            </button>

          </section>

        )}

        {activeSection === "admin" && account.toLowerCase() === admin.toLowerCase() && (
          <section className="panel">
            <div className="section-title">
              <p className="eyebrow">ADMINISTRATION</p>
              <h2>Registrar access</h2>
              <p>Authorize or revoke wallets that may register land. Changes take effect only after the transaction confirms.</p>
            </div>
            <div className="field registrar-field">
              <label htmlFor="registrar-address">Registrar wallet address</label>
              <input
                id="registrar-address"
                placeholder="0x..."
                value={registrarAddress}
                onChange={(event) => setRegistrarAddress(event.target.value)}
              />
            </div>
            <div className="button-row">
              <button
                className="primary-btn"
                type="button"
                disabled={loading}
                onClick={() => updateRegistrar(true)}
              >
                Authorize registrar
              </button>
              <button
                className="secondary-btn"
                type="button"
                disabled={loading}
                onClick={() => updateRegistrar(false)}
              >
                Revoke registrar
              </button>
            </div>
            <p className="empty">The deploying account is the administrator and is initially authorized as a registrar.</p>
          </section>
        )}

        {/* =====================
            CERTIFICATE
        ====================== */}

        {activeSection ===
          "certificate" && (

          <section className="panel">

            <div className="section-title">

              <p className="eyebrow">
                DIGITAL CERTIFICATE
              </p>

              <h2>
                Property Certificate
              </h2>

            </div>

            <div className="search-row">

              <input
                type="number"
                placeholder="Property ID"
                value={searchId}
                onChange={(e) =>
                  setSearchId(
                    e.target.value
                  )
                }
              />

              <button
                onClick={
                  getPropertyDetails
                }
              >
                Generate
              </button>

            </div>

            {property && (

              <div className="certificate">

                <div className="certificate-header">

                  <div>

                    <h2>
                      TERRALEDGER
                    </h2>

                    <span>
                      BLOCKCHAIN LAND REGISTRY
                    </span>

                  </div>

                  <div className="verified-badge">
                    ✓ VERIFIED
                  </div>

                </div>

                <div className="certificate-body">

                  <h1>
                    LAND OWNERSHIP CERTIFICATE
                  </h1>

                  <div className="certificate-grid">

                    <div>
                      <span>
                        PROPERTY ID
                      </span>

                      <strong>
                        #{property.id}
                      </strong>
                    </div>

                    <div>
                      <span>
                        LOCATION
                      </span>

                      <strong>
                        {property.location}
                      </strong>
                    </div>

                    <div>
                      <span>
                        AREA
                      </span>

                      <strong>
                        {property.area}
                      </strong>
                    </div>

                    <div>
                      <span>
                        CURRENT OWNER
                      </span>

                      <strong title={property.owner}>
                        {property.owner}
                      </strong>
                    </div>

                      <div>
                        <span>PRICE (ETH)</span>
                        <strong>{property.price}</strong>
                      </div>

                  </div>

                  <div className="certificate-hash">

                    <span>
                      DOCUMENT SHA-256
                    </span>

                    <code>
                      {property.documentHash}
                    </code>

                  </div>

                  {propertyCid && (

                    <div className="certificate-hash" style={{ marginTop: "16px" }}>

                      <span>
                        IPFS DOCUMENT CID
                      </span>

                      <code>
                        {propertyCid}
                      </code>

                      <div style={{ marginTop: "10px", display: "flex", gap: "12px", fontSize: "11px" }}>
                        <a
                          href={`http://127.0.0.1:8081/ipfs/${propertyCid}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#0284c7", fontWeight: 700, textDecoration: "underline" }}
                        >
                          View via Local IPFS ↗
                        </a>

                        <a
                          href={`${PUBLIC_GATEWAY}/${propertyCid}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#64748b", textDecoration: "underline" }}
                        >
                          Public IPFS Gateway ↗
                        </a>
                      </div>

                    </div>

                  )}

                  <div className="qr" style={{ textAlign: "center", marginTop: "20px" }}>

                    <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setQrMode("app")}
                        style={{
                          padding: "6px 12px",
                          fontSize: "11px",
                          fontWeight: 700,
                          borderRadius: "20px",
                          border: "1px solid #0284c7",
                          background: qrMode === "app" ? "#0284c7" : "transparent",
                          color: qrMode === "app" ? "white" : "#0284c7",
                          cursor: "pointer"
                        }}
                      >
                        📱 Scan to Verify (iOS & Android)
                      </button>

                      {propertyCid && (
                        <button
                          type="button"
                          onClick={() => setQrMode("ipfs")}
                          style={{
                            padding: "6px 12px",
                            fontSize: "11px",
                            fontWeight: 700,
                            borderRadius: "20px",
                            border: "1px solid #10b981",
                            background: qrMode === "ipfs" ? "#10b981" : "transparent",
                            color: qrMode === "ipfs" ? "white" : "#10b981",
                            cursor: "pointer"
                          }}
                        >
                          📄 Scan to View Deed (IPFS)
                        </button>
                      )}
                    </div>

                    <div style={{ background: "white", padding: "12px", borderRadius: "12px", display: "inline-block", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
                      <QRCodeSVG
                        value={
                          qrMode === "ipfs" && propertyCid
                            ? `${PUBLIC_GATEWAY}/${propertyCid}`
                            : getMobileVerificationUrl(property.id)
                        }
                        size={160}
                        level="M"
                      />
                    </div>

                    <p style={{ marginTop: "8px", fontSize: "12px", color: "#64748b" }}>
                      {qrMode === "ipfs" && propertyCid
                        ? "Scan with iPhone / Android camera to view the deed on IPFS"
                        : "Scan with iPhone / Android camera to open mobile verification"}
                    </p>

                    <div style={{ fontSize: "11px", color: "#94a3b8", wordBreak: "break-all", maxWidth: "340px", margin: "6px auto 0" }}>
                      <code>
                        {qrMode === "ipfs" && propertyCid
                          ? `${PUBLIC_GATEWAY}/${propertyCid}`
                          : getMobileVerificationUrl(property.id)}
                      </code>
                    </div>

                  </div>

                </div>

                <div className="certificate-footer">

                  <span>
                    Contract
                    <br />
                    {contractAddress ? shorten(contractAddress) : "Not configured"}
                  </span>

                  <span>
                    Registered
                    <br />
                    {formatDate(
                      property.registeredAt
                    )}
                  </span>

                </div>

              </div>

            )}

          </section>

        )}

        {/* TRANSACTION */}

        {transactionHash && (

          <div className={`transaction-card ${transactionStatus}`}>

            <div>

              <span>
                {transactionStatus === "pending"
                  ? "TRANSACTION PENDING"
                  : transactionStatus === "failed"
                  ? "TRANSACTION NOT CONFIRMED"
                  : "TRANSACTION CONFIRMED"}
              </span>

              <strong>
                {shorten(
                  transactionHash
                )}
              </strong>

            </div>

            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  transactionHash
                )
              }
            >
              Copy Hash
            </button>

          </div>

        )}

        {/* FOOTER */}

        <footer>

          <strong>
            TerraLedger
          </strong>

          <span>
            Blockchain-Based Tamper-Proof
            Land Registry
          </span>

          <span>
            Solidity • Ethers.js • Ganache •
            MetaMask
          </span>

        </footer>

      </main>

    </div>

  );
}

export default App;