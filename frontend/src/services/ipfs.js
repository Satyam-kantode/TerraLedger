/**
 * IPFS Service for TerraLedger
 * Connects to local IPFS Desktop / Kubo node (port 5001)
 * with automatic fallback to public IPFS gateways.
 */

const LOCAL_API_PROXY = "/ipfs-api";
const LOCAL_API_DIRECT = "http://127.0.0.1:5002/api/v0";
export const LOCAL_GATEWAY = "http://127.0.0.1:8082/ipfs";
export const PUBLIC_GATEWAY = "https://ipfs.io/ipfs";

/**
 * Check if the local IPFS daemon is running and reachable
 */
export async function checkIPFSConnection() {
  // Try proxy first (avoids browser CORS issues)
  try {
    const res = await fetch(`${LOCAL_API_PROXY}/version`, {
      method: "POST",
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = await res.json();
      return { online: true, version: data.Version, mode: "proxy" };
    }
  } catch {
    // try direct
  }

  // Try direct port 5001
  try {
    const res = await fetch(`${LOCAL_API_DIRECT}/version`, {
      method: "POST",
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = await res.json();
      return { online: true, version: data.Version, mode: "direct" };
    }
  } catch {
    // offline
  }

  return { online: false, version: null, mode: null };
}

/**
 * Upload a file to local IPFS node
 * @param {File} file
 * @returns {Promise<{cid: string, name: string, size: string}>}
 */
export async function uploadToIPFS(file) {
  const formData = new FormData();
  formData.append("file", file);

  const endpoints = [
    `${LOCAL_API_PROXY}/add?pin=true`,
    `${LOCAL_API_DIRECT}/add?pin=true`,
  ];
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`IPFS returned ${response.status}: ${detail}`);
      }

      const result = await response.json();
      if (!result.Hash) {
        throw new Error("IPFS did not return a content identifier.");
      }
      return {
        cid: result.Hash,
        name: result.Name,
        size: result.Size,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Could not upload the document to IPFS. Start IPFS Desktop/Kubo with its API on port 5001. ${lastError?.message || ""}`.trim()
  );
}

/**
 * Fetch a file directly from local or public IPFS gateways as a Blob
 * @param {string} cid
 * @returns {Promise<Blob>}
 */
export async function fetchFileFromIPFS(cid) {
  if (!cid) throw new Error("No CID provided");
  const candidates = [
    `${LOCAL_GATEWAY}/${cid}`,
    `${LOCAL_API_PROXY}/cat?arg=${encodeURIComponent(cid)}`,
    `${PUBLIC_GATEWAY}/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`
  ];

  for (const url of candidates) {
    try {
      const isApiRequest = url.startsWith(LOCAL_API_PROXY);
      const res = await fetch(url, {
        method: isApiRequest ? "POST" : "GET",
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        return await res.blob();
      }
    } catch {
      // try next gateway
    }
  }
  throw new Error("Could not retrieve document from IPFS. Ensure IPFS Desktop is running.");
}

/**
 * Get accessible URL for a given IPFS CID
 * @param {string} cid
 * @param {string} [fileName]
 * @param {boolean} [preferPublic]
 * @returns {string}
 */
export function getIPFSUrl(cid, fileName = "land-document.pdf", preferPublic = false) {
  if (!cid) return "";
  const fnQuery = fileName ? `?filename=${encodeURIComponent(fileName)}` : "";
  if (preferPublic) {
    return `${PUBLIC_GATEWAY}/${cid}${fnQuery}`;
  }
  return `${LOCAL_GATEWAY}/${cid}${fnQuery}`;
}
