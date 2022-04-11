use anchor_lang::prelude::*;
use anchor_spl::token::{ self, TokenAccount, Token };
use anchor_lang::solana_program::{clock};
use crate::constants::*;


declare_id!("2syTJgihH8pYYnjKK4ZfMacrtzUSd6iTY4pHcC2FrnRZ");

mod constants {
    pub const DAY_TIME: u32 = 60;
    pub const LIVE_TIME: u32 = 30 * DAY_TIME;
    pub const DECIMAL: u64 = 1000000000;
    #[warn(dead_code)]
    pub const DEPOSITE_FEE: u64 = 10 * DECIMAL;
    pub const APY: u32 = 5;
}

#[program]
pub mod solch_staking {
    use super::*;
    pub fn create_vault(_ctx: Context<VaultAccount>, _bump_vault: u8) -> Result<()> {
        Ok(())
    }
    pub fn create_time(_ctx: Context<TimeAccount>, _bump_time: u8) -> Result<()> {
        println! ("_ctx = {:?}", _ctx.accounts.time);
        let time = &mut _ctx.accounts.time;
        time.owner = _ctx.accounts.admin.key();
        Ok(())
    }
    pub fn create_pool(_ctx: Context<PoolAccount>, _bump_pool: u8) -> Result<()> {
        let pool = &mut _ctx.accounts.pool;
        pool.owner = _ctx.accounts.user.key();
        pool.is_stake = false;
        Ok(())
    }
    pub fn set_current_time(_ctx: Context<SetTimeAccount>, current_time: u32) -> Result<()> {
        let time = &mut _ctx.accounts.current_time;
        if time.owner != _ctx.accounts.user.key() {
            return Err(ErrorCode::AuthorityInvalid.into());
        }
        time.current_time = current_time;
        Ok(())
    }
    pub fn stake(_ctx: Context<StakeAccount>, amount: u32) -> Result<()> {
        let pool = &mut _ctx.accounts.pool;
        let current_time = &mut _ctx.accounts.current_time;
        if pool.owner != _ctx.accounts.user.key() {
            return Err(ErrorCode::AuthorityInvalid.into());
        }
        if pool.is_stake {
            return Err(ErrorCode::AlreadyStaked.into());
        }
        // let clock = clock::Clock::get().unwrap();
        pool.last_time = get_current_timestamp(current_time) as u32;
        pool.start_time = get_current_timestamp(current_time) as u32;
        let real_amount: u64 = amount as u64 * DECIMAL;
        pool.amount = real_amount  - DEPOSITE_FEE as u64;
        pool.reward = (real_amount - DEPOSITE_FEE as u64) * APY as u64 / 100 / LIVE_TIME as u64;
        pool.is_stake = true;
        let cpi_ctx = CpiContext::new(
            _ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: _ctx.accounts.from.to_account_info(),
                to: _ctx.accounts.to.to_account_info(),
                authority: _ctx.accounts.user.to_account_info(),
            }
        );
        token::transfer(cpi_ctx, real_amount.into());
        Ok(())
    }
    pub fn claim(_ctx: Context<ClaimAccount>, bump_vault: u8) -> Result<()> {
        let pool = &mut _ctx.accounts.pool;
        let current_time = &mut _ctx.accounts.current_time;
        if pool.owner != _ctx.accounts.user.key() {
            return Err(ErrorCode::AuthorityInvalid.into());
        }
        // let clock = clock::Clock::get().unwrap();
        let vault_seeds = &[
            b"SOLCH_STAKING_ACCOUNT".as_ref(),
            &[bump_vault]
        ];
        let vault_signer = &[&vault_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            _ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: _ctx.accounts.from.to_account_info(),
                to: _ctx.accounts.to.to_account_info(),
                authority: _ctx.accounts.vault.to_account_info()
            },
            vault_signer
        );
        let time_stamp: u32 = get_current_timestamp(current_time) as u32 - pool.last_time;
        let claim_amount: u64;
        if time_stamp > LIVE_TIME {
            claim_amount = pool.amount * APY as u64 / 100;
        } else {
            claim_amount = time_stamp as u64 * pool.reward;
        }
        
        pool.last_time = get_current_timestamp(current_time) as u32;
        token::transfer(cpi_ctx, claim_amount.into());
        Ok(())
    }
    pub fn unstake(_ctx: Context<UnstakeAccount>, bump: u8) -> Result<()> {
        let pool = &mut _ctx.accounts.pool;
        let current_time = &mut _ctx.accounts.current_time;
        if pool.owner != _ctx.accounts.user.key() {
            return Err(ErrorCode::AuthorityInvalid.into());
        }
        // let clock = clock::Clock::get().unwrap();
        let time_stamp: u32 = get_current_timestamp(current_time) as u32 - pool.start_time;
        let claim_amount: u64;
        if time_stamp >= LIVE_TIME {
            let reward = (pool.start_time + LIVE_TIME - pool.last_time) as u64 / DAY_TIME as u64 * pool.reward;
            claim_amount = pool.amount + reward;
        } else {
            return Err(ErrorCode::UnStakeTimingInvalid.into());
        }
       
        let vault_seeds = &[
            b"SOLCH_STAKING_ACCOUNT".as_ref(),
            &[bump]
        ];
        let vault_signer = &[&vault_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            _ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: _ctx.accounts.from.to_account_info(),
                to: _ctx.accounts.to.to_account_info(),
                authority: _ctx.accounts.vault.to_account_info()
            },
            vault_signer
        );
        pool.is_stake = false;
        token::transfer(cpi_ctx, claim_amount.into());
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct VaultAccount<'info> {
    #[account(init, seeds=[b"SOLCH_STAKING_ACCOUNT".as_ref()], bump, payer = admin, space = 8 + 1)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct PoolAccount<'info> {
    #[account(init, seeds=[b"SOLCH_STAKING_POOL".as_ref(), user.key().as_ref()], bump, payer = user, space = 8 + 32 + 32 + 4 + 1)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>
}
#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct TimeAccount<'info> {
    #[account(init, seeds=[b"CURRENT_TIME".as_ref()], bump, payer = admin, space = 8 + 4 + 32)]
    pub time: Account<'info, CurrentTime>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>
}
#[derive(Accounts)]
pub struct SetTimeAccount<'info> {
    pub user: Signer<'info>,
    #[account(mut)]
    pub current_time: Account<'info, CurrentTime>,
}
#[derive(Accounts)]
pub struct StakeAccount<'info> {
    pub user: Signer<'info>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    pub current_time: Account<'info, CurrentTime>,
    pub token_program: Program<'info, Token>,
}
#[derive(Accounts)]
pub struct ClaimAccount<'info> {
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    pub user: Signer<'info>,
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    pub current_time: Account<'info, CurrentTime>,
    pub token_program: Program<'info, Token>,
}
#[derive(Accounts)]
pub struct UnstakeAccount<'info> {
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    pub user: Signer<'info>,
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    pub current_time: Account<'info, CurrentTime>,
    pub token_program: Program<'info, Token>
}
#[account]
pub struct Vault {
    pub bump_vault: u8
}
#[account]
pub struct Pool {
    pub owner: Pubkey,
    pub amount: u64,
    pub last_time: u32,
    pub start_time: u32,
    pub reward: u64,
    pub is_stake: bool
}

#[account]
#[derive(Debug)]
pub struct CurrentTime {
    pub current_time: u32,
    pub owner: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Authority is invalid")]
    AuthorityInvalid,
    #[msg("Unstake is not available")]
    UnStakeTimingInvalid,
    #[msg("Already staked")]
    AlreadyStaked
}

fn get_current_timestamp(current_time_account: &CurrentTime) -> u32 {
    // clock::Clock::get().unwrap().unix_timestamp as u32
    current_time_account.current_time
}