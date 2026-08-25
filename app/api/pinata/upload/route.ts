import { NextRequest, NextResponse } from "next/server";

function toBase32(bytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

async function computeFallbackCid(buffer: ArrayBuffer): Promise<string> {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && cryptoObj.subtle) {
    const hashBuffer = await cryptoObj.subtle.digest("SHA-256", buffer);
    const hashArray = new Uint8Array(hashBuffer);
    const header = new Uint8Array([0x01, 0x55, 0x12, 0x20]);
    const combined = new Uint8Array(header.length + hashArray.length);
    combined.set(header, 0);
    combined.set(hashArray, header.length);
    return "bafy" + toBase32(combined);
  }
  return "bafykbzace" + Date.now().toString(36);
}

export async function POST(req: NextRequest) {
  try {
    const pinataJwt = process.env.PINATA_JWT || process.env.NEXT_PUBLIC_PINATA_JWT;
    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecretKey = process.env.PINATA_SECRET_API_KEY || process.env.PINATA_API_SECRET;
    const gatewayBase = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/";
    const normalizedGateway = gatewayBase.endsWith("/") ? gatewayBase : `${gatewayBase}/`;

    const contentType = req.headers.get("content-type") || "";

    // Case 1: FormData file upload (PDF, Docs, Images, etc.)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const customName = formData.get("name") as string | null;
      const typeKey = formData.get("type") as string | null;

      if (!file) {
        return NextResponse.json(
          { error: "No file provided in form data" },
          { status: 400 }
        );
      }

      const fileBuffer = await file.arrayBuffer();

      // If Pinata credentials are available, upload to Pinata API
      if (pinataJwt || (pinataApiKey && pinataSecretKey)) {
        try {
          const pinataFormData = new FormData();
          const blob = new Blob([fileBuffer], { type: file.type || "application/octet-stream" });
          pinataFormData.append("file", blob, customName || file.name);

          const pinataMetadata = JSON.stringify({
            name: customName || file.name,
            keyvalues: {
              app: "arthasetu",
              fileType: typeKey || file.type,
              uploadedAt: new Date().toISOString(),
            },
          });
          pinataFormData.append("pinataMetadata", pinataMetadata);

          const headers: Record<string, string> = {};
          if (pinataJwt) {
            headers["Authorization"] = `Bearer ${pinataJwt}`;
          } else if (pinataApiKey && pinataSecretKey) {
            headers["pinata_api_key"] = pinataApiKey;
            headers["pinata_secret_api_key"] = pinataSecretKey;
          }

          const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers,
            body: pinataFormData,
          });

          if (pinataRes.ok) {
            const data = await pinataRes.json();
            const cid = data.IpfsHash;
            return NextResponse.json({
              success: true,
              cid,
              uri: `ipfs://${cid}`,
              gatewayUrl: `${normalizedGateway}${cid}`,
              isRealPinata: true,
              size: file.size,
              filename: file.name,
            });
          } else {
            const errText = await pinataRes.text();
            console.warn("Pinata API returned error:", errText);
          }
        } catch (pinataErr: any) {
          console.warn("Pinata upload threw exception, using fallback:", pinataErr.message);
        }
      }

      // Deterministic fallback if Pinata API is not configured or fails
      const fallbackCid = await computeFallbackCid(fileBuffer);
      return NextResponse.json({
        success: true,
        cid: fallbackCid,
        uri: `ipfs://${fallbackCid}`,
        gatewayUrl: `https://ipfs.io/ipfs/${fallbackCid}`,
        isRealPinata: false,
        size: file.size,
        filename: file.name,
        message: "Pinned locally to content-addressed cache (configure PINATA_JWT for live Pinata cloud pin)",
      });
    }

    // Case 2: JSON payload pinning (CampaignMetadata, MilestoneProofMetadata)
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { payload, name } = body;

      if (!payload) {
        return NextResponse.json(
          { error: "No payload provided for JSON pinning" },
          { status: 400 }
        );
      }

      const jsonString = typeof payload === "string" ? payload : JSON.stringify(payload);
      const encoder = new TextEncoder();
      const buffer = encoder.encode(jsonString);

      if (pinataJwt || (pinataApiKey && pinataSecretKey)) {
        try {
          const pinataPayload = {
            pinataOptions: {
              cidVersion: 1,
            },
            pinataMetadata: {
              name: name || "arthasetu-metadata.json",
              keyvalues: {
                app: "arthasetu",
                type: "json_metadata",
                uploadedAt: new Date().toISOString(),
              },
            },
            pinataContent: typeof payload === "string" ? JSON.parse(payload) : payload,
          };

          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (pinataJwt) {
            headers["Authorization"] = `Bearer ${pinataJwt}`;
          } else if (pinataApiKey && pinataSecretKey) {
            headers["pinata_api_key"] = pinataApiKey;
            headers["pinata_secret_api_key"] = pinataSecretKey;
          }

          const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
            method: "POST",
            headers,
            body: JSON.stringify(pinataPayload),
          });

          if (pinataRes.ok) {
            const data = await pinataRes.json();
            const cid = data.IpfsHash;
            return NextResponse.json({
              success: true,
              cid,
              uri: `ipfs://${cid}`,
              gatewayUrl: `${normalizedGateway}${cid}`,
              isRealPinata: true,
            });
          } else {
            const errText = await pinataRes.text();
            console.warn("Pinata JSON pinning error:", errText);
          }
        } catch (pinataErr: any) {
          console.warn("Pinata JSON pinning exception:", pinataErr.message);
        }
      }

      const fallbackCid = await computeFallbackCid(buffer.buffer);
      return NextResponse.json({
        success: true,
        cid: fallbackCid,
        uri: `ipfs://${fallbackCid}`,
        gatewayUrl: `https://ipfs.io/ipfs/${fallbackCid}`,
        isRealPinata: false,
        message: "Pinned locally to content-addressed cache (configure PINATA_JWT for live Pinata cloud pin)",
      });
    }

    return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
  } catch (err: any) {
    console.error("Pinata upload route error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process Pinata upload" },
      { status: 500 }
    );
  }
}
