import * as anchor from "@project-serum/anchor";
import { Program, Spl } from "@project-serum/anchor";
import { SolchStaking } from "../target/types/solch_staking";
import fs from "fs";
var jsonFile = "/home/panda/.config/solana/id.json";
var parsed = JSON.parse(fs.readFileSync(jsonFile));
import {
  AccountLayout,
  TOKEN_PROGRAM_ID,
  createAccount,
  createMint,
  getMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
  createInitializeAccountInstruction,
} from "@solana/spl-token";

import { ConfirmOptions } from "@solana/web3.js";
const { SystemProgram, Keypair, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } =
  anchor.web3;

// const token_mint = "5GrSWmrmtdpR8K8EKeywtBpXT7F1ZniNxq1MC1ZCv6a8";

describe("solch_staking", () => {
  // Configure the client to use the local cluster.

  it("Is initialized!", async () => {
    const provider = anchor.Provider.env();
    anchor.setProvider(anchor.Provider.env());
    // const myAccount = Keypair.generate();
    // const auxiliaryKeypair = Keypair.generate();

    // const airdropSignature = await provider.connection.requestAirdrop(
    //   myAccount.publicKey,
    //   2 * LAMPORTS_PER_SOL
    // );

    // await provider.connection.confirmTransaction(airdropSignature);

    const signer = Keypair.fromSecretKey(new Uint8Array(parsed));

    let bal = await provider.connection.getBalance(
      signer.publicKey,
      "confirmed"
    );
    console.log("bal = ", bal);
    console.log(
      "parsed = ",
      Keypair.fromSecretKey(new Uint8Array(parsed)).publicKey
    );
    console.log("wallet = ", provider.wallet.publicKey);

    const token_mint = await createMint(
      provider.connection,
      signer,
      signer.publicKey,
      signer.publicKey,
      9
    );
    console.log("mintkey = ", token_mint.toBase58());

    const ownerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      signer,
      token_mint,
      signer.publicKey
    );

    console.log(
      "ownerTokenAccount.address.toBase58() = ",
      ownerTokenAccount.address.toBase58()
    );

    await mintTo(
      provider.connection,
      signer,
      token_mint,
      ownerTokenAccount.address,
      signer.publicKey,
      1000000 * LAMPORTS_PER_SOL
    );

    const mintInfo = await getMint(provider.connection, token_mint);
    console.log("mintInfo.supply = ", mintInfo.supply);

    let ownerTokenAccountInfo = await getAccount(
      provider.connection,
      ownerTokenAccount.address
    );
    console.log(
      "ownerTokenAccountInfo.amount = ",
      ownerTokenAccountInfo.amount
    );

    const tokenAccounts = await provider.connection.getTokenAccountsByOwner(
      signer.publicKey,
      {
        programId: TOKEN_PROGRAM_ID,
      }
    );

    console.log("Token                                         Balance");
    console.log("------------------------------------------------------------");
    tokenAccounts.value.forEach((e) => {
      const accountInfo = AccountLayout.decode(e.account.data);
      console.log(`${new PublicKey(accountInfo.mint)}   ${accountInfo.amount}`);
    });

    const program = anchor.workspace.SolchStaking as Program<SolchStaking>;
    let [vaultPDA, _nonce] = await PublicKey.findProgramAddress(
      [Buffer.from("SOLCH_STAKING_ACCOUNT")],
      program.programId
    );

    console.log("vaultPda = ", vaultPDA.toString(), "nonce", _nonce);

    const aTokenAccount = new Keypair();
    const aTokenAccountRent =
      await provider.connection.getMinimumBalanceForRentExemption(
        AccountLayout.span
      );

    // console.log("tokenAccount", aTokenAccount.publicKey.toString());
    // Add your test here.
    let sig = await program.rpc.createVault(_nonce, {
      accounts: {
        vault: vaultPDA,
        admin: signer.publicKey,
        systemProgram: SystemProgram.programId,
      },
      // signers: [aTokenAccount],
      // instructions: [
      //   SystemProgram.createAccount({
      //     fromPubkey: signer.publicKey,
      //     newAccountPubkey: aTokenAccount.publicKey,
      //     lamports: aTokenAccountRent,
      //     space: AccountLayout.span,
      //     programId: TOKEN_PROGRAM_ID,
      //   }),
      //   createInitializeAccountInstruction(
      //     aTokenAccount.publicKey,
      //     token_mint,
      //     vaultPDA,
      //     TOKEN_PROGRAM_ID
      //   ),
      // ],
    });
    await provider.connection.confirmTransaction(sig);

    let aTokenAccount_res = await createAccount(
      provider.connection,
      signer,
      token_mint,
      vaultPDA,
      aTokenAccount
    );

    console.log("sig", sig);
    console.log(
      "aTokenAccount, aTokenAccountInfo = ",
      aTokenAccount.publicKey.toBase58(),
      aTokenAccount_res.toBase58()
    );

    let info = await provider.connection.getProgramAccounts(
      program.programId,
      "confirmed"
    );
    console.log("vault info = ", info);
    console.log("valut address = ", info[0].pubkey.toBase58());

    let accounts = await provider.connection.getParsedTokenAccountsByOwner(
      vaultPDA,
      {
        mint: token_mint,
      },
      "confirmed"
    );
    console.log("accounts = ", accounts.value[0].account.data.parsed.info);

    let [pool, nonce_pool] = await PublicKey.findProgramAddress(
      [Buffer.from("SOLCH_STAKING_POOL"), signer.publicKey.toBuffer()],
      program.programId
    );

    // start stake
    let signature = await program.rpc.createPool(nonce_pool, {
      accounts: {
        pool: pool,
        user: signer.publicKey,
        systemProgram: SystemProgram.programId,
      },
      // signers: [],
      // instructions: [
      //   program.instruction.stake(110, {
      //     accounts: {
      //       user: signer.publicKey,
      //       pool: pool,
      //       from: ownerTokenAccount.address,
      //       to: aTokenAccount.publicKey,
      //       tokenProgram: TOKEN_PROGRAM_ID,
      //     },
      //   }),
      // ],
    });
    await provider.connection.confirmTransaction(signature);
    console.log("signature = ", signature);

    let poolInfo = await program.account.pool.fetch(pool);
    console.log("poolInfo = ", poolInfo);

    let [time, time_nonce] = await PublicKey.findProgramAddress(
      [Buffer.from("CURRENT_TIME")],
      program.programId
    );

    let timesig = await program.rpc.createTime(time_nonce, {
      accounts: {
        time: time,
        admin: signer.publicKey,
        systemProgram: SystemProgram.programId,
      },
    });
    await provider.connection.confirmTransaction(timesig);
    console.log("timesig = ", timesig);

    let timeInfo = await program.account.currentTime.fetch(time);
    console.log("timeInfo = ", timeInfo.currentTime);

    let stakesig = await program.rpc.stake(110, {
      accounts: {
        user: signer.publicKey,
        pool: pool,
        from: ownerTokenAccount.address,
        to: aTokenAccount.publicKey,
        currentTime: time,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });
    await provider.connection.confirmTransaction(stakesig);
    console.log("stakesig = ", stakesig);

    poolInfo = await program.account.pool.fetch(pool);
    console.log("poolInfo = , amount = ", poolInfo, poolInfo.amount.toString());

    let settimesig = await program.rpc.setCurrentTime(60 * 15, {
      accounts: {
        user: signer.publicKey,
        currentTime: time,
      },
    });
    await provider.connection.confirmTransaction(settimesig);

    timeInfo = await program.account.currentTime.fetch(time);
    console.log("timeInfo = ", timeInfo.currentTime);

    ownerTokenAccountInfo = await getAccount(
      provider.connection,
      ownerTokenAccount.address
    );
    console.log(
      "ownerTokenAccountInfo.amount = ",
      ownerTokenAccountInfo.amount
    );

    let claimsig = await program.rpc.claim(_nonce, {
      accounts: {
        vault: vaultPDA,
        pool: pool,
        user: signer.publicKey,
        from: aTokenAccount.publicKey,
        to: ownerTokenAccount.address,
        currentTime: time,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });
    await provider.connection.confirmTransaction(claimsig);
    console.log("claimsig = ", claimsig);

    poolInfo = await program.account.pool.fetch(pool);
    console.log("poolInfo = , amount = ", poolInfo, poolInfo.amount.toString());

    ownerTokenAccountInfo = await getAccount(
      provider.connection,
      ownerTokenAccount.address
    );
    console.log(
      "ownerTokenAccountInfo.amount = ",
      ownerTokenAccountInfo.amount
    );

    settimesig = await program.rpc.setCurrentTime(60 * 30, {
      accounts: {
        user: signer.publicKey,
        currentTime: time,
      },
    });
    await provider.connection.confirmTransaction(settimesig);

    let unstakesig = await program.rpc.unstake(_nonce, {
      accounts: {
        vault: vaultPDA,
        pool: pool,
        user: signer.publicKey,
        from: aTokenAccount.publicKey,
        to: ownerTokenAccount.address,
        currentTime: time,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });
    await provider.connection.confirmTransaction(unstakesig);
    console.log("unstakesig = ", unstakesig);

    poolInfo = await program.account.pool.fetch(pool);
    console.log("poolInfo = , amount = ", poolInfo, poolInfo.amount.toString());
  });
});
