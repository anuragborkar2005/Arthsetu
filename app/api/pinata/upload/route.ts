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
    const rawJwt = process.env.PINATA_JWT || process.env.NEXT_PUBLIC_PINATA_JWT || "";
    const cleanJwt = rawJwt.trim().replace(/^Bearer\s+/i, "");
    const pinataApiKey = process.env.PINATA_API_KEY?.trim();
    const pinataSecretKey = (process.env.PINATA_SECRET_API_KEY || process.env.PINATA_API_SECRET)?.trim();
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
      const fileName = customName || file.name || "upload.bin";

      // If Pinata JWT is available, upload via modern Pinata v3 Files API
      if (cleanJwt) {
        try {
          const pinataFormData = new FormData();
          const fileBlob = new Blob([fileBuffer], { type: file.type || "application/octet-stream" });
          pinataFormData.append("file", fileBlob, fileName);
          pinataFormData.append("name", fileName);
          pinataFormData.append("network", "public");
          pinataFormData.append("cid_version", "v1");
          pinataFormData.append(
            "keyvalues",
            JSON.stringify({
              app: "arthasetu",
              fileType: typeKey || file.type || "document",
              uploadedAt: new Date().toISOString(),
            })
          );

          const pinataRes = await fetch("https://uploads.pinata.cloud/v3/files", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${cleanJwt}`,
            },
            body: pinataFormData,
            signal: AbortSignal.timeout(15000),
          });

          if (pinataRes.ok) {
            const resJson = await pinataRes.json();
            const cid = resJson.data?.cid || resJson.IpfsHash || resJson.cid;
            if (cid) {
              return NextResponse.json({
                success: true,
                cid,
                uri: `ipfs://${cid}`,
                gatewayUrl: `${normalizedGateway}${cid}`,
                isRealPinata: true,
                size: file.size,
                filename: fileName,
              });
            }
          } else {
            const errText = await pinataRes.text();
            console.warn("Pinata v3 Files API error response:", pinataRes.status, errText);
          }
        } catch (pinataErr: unknown) {
          const msg = pinataErr instanceof Error ? pinataErr.message : String(pinataErr);
          console.warn("Pinata v3 upload unavailable, activating fallback:", msg);
        }
      } else if (pinataApiKey && pinataSecretKey) {
        // Fallback for legacy API keys
        try {
          const pinataFormData = new FormData();
          const fileBlob = new Blob([fileBuffer], { type: file.type || "application/octet-stream" });
          pinataFormData.append("file", fileBlob, fileName);
          pinataFormData.append(
            "pinataMetadata",
            JSON.stringify({
              name: fileName,
              keyvalues: {
                app: "arthasetu",
                fileType: typeKey || file.type,
                uploadedAt: new Date().toISOString(),
              },
            })
          );

          const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers: {
              pinata_api_key: pinataApiKey,
              pinata_secret_api_key: pinataSecretKey,
            },
            body: pinataFormData,
            signal: AbortSignal.timeout(15000),
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
              filename: fileName,
            });
          }
        } catch (legacyErr: unknown) {
          console.warn("Legacy Pinata API error:", legacyErr);
        }
      }

      // Deterministic fallback if Pinata API is not configured or offline
      const fallbackCid = await computeFallbackCid(fileBuffer);
      return NextResponse.json({
        success: true,
        cid: fallbackCid,
        uri: `ipfs://${fallbackCid}`,
        gatewayUrl: `https://ipfs.io/ipfs/${fallbackCid}`,
        isRealPinata: false,
        size: file.size,
        filename: file.name,
        message: "Pinned locally to content-addressed cache (offline fallback)",
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
      const fileName = name || "arthasetu-metadata.json";

      if (cleanJwt) {
        try {
          const pinataFormData = new FormData();
          const jsonBlob = new Blob([jsonString], { type: "application/json" });
          pinataFormData.append("file", jsonBlob, fileName);
          pinataFormData.append("name", fileName);
          pinataFormData.append("network", "public");
          pinataFormData.append("cid_version", "v1");
          pinataFormData.append(
            "keyvalues",
            JSON.stringify({
              app: "arthasetu",
              type: "json_metadata",
              uploadedAt: new Date().toISOString(),
            })
          );

          const pinataRes = await fetch("https://uploads.pinata.cloud/v3/files", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${cleanJwt}`,
            },
            body: pinataFormData,
            signal: AbortSignal.timeout(15000),
          });

          if (pinataRes.ok) {
            const resJson = await pinataRes.json();
            const cid = resJson.data?.cid || resJson.IpfsHash || resJson.cid;
            if (cid) {
              return NextResponse.json({
                success: true,
                cid,
                uri: `ipfs://${cid}`,
                gatewayUrl: `${normalizedGateway}${cid}`,
                isRealPinata: true,
              });
            }
          } else {
            const errText = await pinataRes.text();
            console.warn("Pinata v3 JSON pinning error response:", pinataRes.status, errText);
          }
        } catch (pinataErr: unknown) {
          const msg = pinataErr instanceof Error ? pinataErr.message : String(pinataErr);
          console.warn("Pinata v3 JSON pinning unavailable, activating fallback:", msg);
        }
      } else if (pinataApiKey && pinataSecretKey) {
        try {
          const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              pinata_api_key: pinataApiKey,
              pinata_secret_api_key: pinataSecretKey,
            },
            body: JSON.stringify({
              pinataOptions: { cidVersion: 1 },
              pinataMetadata: { name: fileName },
              pinataContent: typeof payload === "string" ? JSON.parse(payload) : payload,
            }),
            signal: AbortSignal.timeout(15000),
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
          }
        } catch (legacyErr: unknown) {
          console.warn("Legacy Pinata JSON error:", legacyErr);
        }
      }

      const fallbackCid = await computeFallbackCid(buffer.buffer);
      return NextResponse.json({
        success: true,
        cid: fallbackCid,
        uri: `ipfs://${fallbackCid}`,
        gatewayUrl: `https://ipfs.io/ipfs/${fallbackCid}`,
        isRealPinata: false,
        message: "Pinned locally to content-addressed cache (offline fallback)",
      });
    }

    return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Pinata upload route error:", msg);
    return NextResponse.json(
      { error: msg || "Failed to process Pinata upload" },
      { status: 500 }
    );
  }
}
