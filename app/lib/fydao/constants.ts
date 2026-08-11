import type { Address } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { FYDAO_PROGRAM_ADDRESS } from "../../generated/fydao/programs";

export {
  FYDAO_PROGRAM_ADDRESS,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
};

export const MPL_TOKEN_METADATA_PROGRAM_ADDRESS =
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s" as Address<"metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s">;

export const RENT_ADDRESS =
  "SysvarRent111111111111111111111111111111111" as Address<"SysvarRent111111111111111111111111111111111">;

/** Keypair that owns the on-chain program (single signer, from Anchor's id.json). */
export const GENESIS_AUTHORITY =
  "34kp5qNiaYXB7fFQpZiYcur1SBr5ub6HQjsoC82ZD3uM" as Address<"34kp5qNiaYXB7fFQpZiYcur1SBr5ub6HQjsoC82ZD3uM">;

/** Real USDC on mainnet and devnet. */
export const USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as Address<"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">;

export const STORAGE_KEY = "fydao";

export const PROPOSAL_STATE_LABELS: Record<number, string> = {
  0: "Pending",
  1: "Active",
  2: "Canceled",
  3: "Defeated",
  4: "Succeeded",
  5: "Queued",
  6: "Expired",
  7: "Executed",
};

export const ACTION_LABELS: Record<string, string> = {
  ApproveCampaign: "Approve campaign",
  ReleaseMilestone: "Release milestone",
  EmergencyWithdraw: "Emergency withdraw",
  TransferAuthority: "Transfer authority",
};

export const VOTE_SUPPORT_LABELS = ["Against", "For", "Abstain"];
