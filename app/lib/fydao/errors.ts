import { isSolanaError, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM } from "@solana/kit";
import { getFydaoErrorMessage, type FydaoError } from "../../generated/fydao/errors";

export function describeFydaoError(err: unknown): string | null {
  if (
    isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM) &&
    typeof err.context?.code === "number"
  ) {
    return getFydaoErrorMessage(err.context.code as FydaoError);
  }

  const str = String(err && typeof err === "object" && "message" in err ? err.message : err);

  // Check for IncorrectProgramId in ATA creation / token program
  if (str.includes("IncorrectProgramId") || str.includes("incorrect program id")) {
    if (str.includes("AToken") || str.includes("CreateIdempotent") || str.includes("Tokenkeg")) {
      return "Token account creation failed: The specified token mint account is either uninitialized on this cluster or belongs to a different token program (e.g. Token-2022). If running on Localnet or Devnet, please initialize or select a valid mint in the Admin Console (/admin).";
    }
    return "Transaction failed: An instruction specified an incorrect or uninitialized on-chain program ID.";
  }

  // Check for AccountNotFound (7050003) or uninitialized
  if (str.includes("7050003") || str.includes("AccountNotFound") || str.includes("could not find account")) {
    return "Wallet Account Not Funded: Your connected wallet has 0 SOL on this cluster and cannot pay transaction fees. On Localnet/Devnet, click 'Airdrop 5 SOL' in the Admin Console (/admin) or run 'solana airdrop 2'.";
  }

  // Check for InsufficientFunds
  if (str.includes("InsufficientFunds") || str.includes("insufficient lamports")) {
    return "Insufficient SOL balance in your wallet to cover transaction fees and account rent exemption.";
  }

  // Check for User rejected
  if (str.includes("User rejected") || str.includes("User cancelled") || str.includes("declined")) {
    return "Transaction signature rejected in wallet.";
  }

  return null;
}

export function friendlyError(err: unknown): string {
  const described = describeFydaoError(err);
  if (described) return described;
  if (err instanceof Error) return err.message;
  return String(err);
}

export { getFydaoErrorMessage, type FydaoError };
