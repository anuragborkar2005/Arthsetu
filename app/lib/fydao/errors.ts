import { isSolanaError, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM } from "@solana/kit";
import { getFydaoErrorMessage, type FydaoError } from "../../generated/fydao/errors";

export function describeFydaoError(err: unknown): string | null {
  if (
    isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM) &&
    typeof err.context?.code === "number"
  ) {
    return getFydaoErrorMessage(err.context.code as FydaoError);
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
