import {
  createKeyPairSignerFromPrivateKeyBytes,
  type Address,
  type ClientWithGetMinimumBalance,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  fetchMint,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getCreateMintInstructionPlan,
  getMintToInstruction,
  type Mint,
} from "@solana-program/token";
import type { InstructionPlan } from "@solana/instruction-plans";
import type { SolanaClient } from "../solana-client";
import { findAta } from "./pdas";
import { TOKEN_PROGRAM_ADDRESS } from "./constants";

/** Flattens an instruction plan into a linear list of instructions. */
export function planToInstructions(plan: InstructionPlan): Instruction[] {
  switch (plan.kind) {
    case "single":
      return [plan.instruction];
    case "parallel":
    case "sequential":
      return plan.plans.flatMap(planToInstructions);
    case "messagePacker":
      throw new Error("Cannot flatten a messagePacker instruction plan");
  }
}

export async function getMintInfo(rpc: SolanaClient["rpc"], mint: Address) {
  try {
    return await fetchMint(rpc, mint);
  } catch {
    return null;
  }
}

export async function getTokenAccountBalance(
  rpc: SolanaClient["rpc"],
  owner: Address,
  mint: Address,
): Promise<{ amount: bigint; decimals: number } | null> {
  try {
    const [ata] = await findAta(owner, mint);
    return await getTokenAccountBalanceByAddress(rpc, ata);
  } catch {
    return null;
  }
}

export async function getTokenAccountBalanceByAddress(
  rpc: SolanaClient["rpc"],
  account: Address,
): Promise<{ amount: bigint; decimals: number } | null> {
  try {
    const { value } = await rpc.getTokenAccountBalance(account).send();
    return { amount: BigInt(value.amount), decimals: value.decimals };
  } catch {
    return null;
  }
}

export type CreatedMint = {
  instructions: Instruction[];
  mintAddress: Address;
  /** 32-byte private key of the mint authority-free account signer. */
  privateKey: Uint8Array;
};

/** Creates a token mint owned by `mintAuthority`. Returns instructions and the keypair signer. */
export async function createMintWithAuthority(
  client: SolanaClient,
  payer: TransactionSigner,
  mintAuthority: Address,
  decimals: number,
  privateKey?: Uint8Array,
): Promise<CreatedMint> {
  const secret = privateKey ?? randomBytes(32);
  const signer = await createKeyPairSignerFromPrivateKeyBytes(secret);
  const rent = await client.rpc
    .getMinimumBalanceForRentExemption(82n)
    .send()
    .catch(() => 1_461_600n);
  const plan = await getCreateMintInstructionPlan(
    client as unknown as ClientWithGetMinimumBalance,
    {
      payer,
      newMint: signer,
      decimals,
      mintAuthority,
      freezeAuthority: null,
      mintAccountLamports: Number(rent),
    },
  );
  return {
    instructions: planToInstructions(plan),
    mintAddress: signer.address,
    privateKey: secret,
  };
}

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Creates an associated token account for `owner` on `mint` (idempotent). */
export async function createAtaInstruction(
  payer: TransactionSigner,
  owner: Address,
  mint: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
): Promise<Instruction> {
  const [ata] = await findAta(owner, mint, tokenProgram);
  return getCreateAssociatedTokenIdempotentInstructionAsync({
    payer,
    ata,
    owner,
    mint,
    systemProgram:
      "11111111111111111111111111111111" as Address<"11111111111111111111111111111111">,
    tokenProgram,
  });
}

/** Mints `amount` of `mint` (owned by the signer) into `owner`'s ATA. */
export async function mintToInstruction(
  authority: TransactionSigner,
  owner: Address,
  mint: Address,
  amount: bigint,
): Promise<Instruction> {
  const [destination] = await findAta(owner, mint);
  return getMintToInstruction({
    mint,
    token: destination,
    mintAuthority: authority,
    amount,
  });
}

export type { Mint };
