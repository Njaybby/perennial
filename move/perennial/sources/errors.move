/// Abort codes for the whole package, blocked by module so a raw code in a failed transaction says where it came from.
/// Registry owns 1000, endowment 2000, pricing 5000.
module perennial::errors {
    const E_NOT_ADMIN: u64 = 1001;
    const E_PAUSED: u64 = 1002;
    const E_ALREADY_INITIALIZED: u64 = 1003;
    const E_BAD_SPLIT: u64 = 1004;
    const E_UNAUTHORIZED_GATEWAY: u64 = 1005;
    const E_NOT_INITIALIZED: u64 = 1006;

    const E_ENDOWMENT_EXISTS: u64 = 2001;
    const E_NO_ENDOWMENT: u64 = 2002;
    const E_NOT_OWNER: u64 = 2003;
    const E_INSUFFICIENT_BALANCE: u64 = 2004;
    const E_WRONG_STATE: u64 = 2005;
    const E_TOO_EARLY_TO_RENEW: u64 = 2006;
    const E_EXPIRY_DID_NOT_ADVANCE: u64 = 2007;
    const E_COST_EXCEEDS_CAP: u64 = 2008;
    const E_GRACE_ELAPSED: u64 = 2009;
    const E_BELOW_MIN_ENDOWMENT: u64 = 2010;
    const E_TARGET_RUNWAY_TOO_LOW: u64 = 2011;

    const E_STALE_PRICE: u64 = 5001;
    const E_PRICE_DEVIATION: u64 = 5002;

    public fun not_admin(): u64 { E_NOT_ADMIN }
    public fun paused(): u64 { E_PAUSED }
    public fun already_initialized(): u64 { E_ALREADY_INITIALIZED }
    public fun bad_split(): u64 { E_BAD_SPLIT }
    public fun unauthorized_gateway(): u64 { E_UNAUTHORIZED_GATEWAY }
    public fun not_initialized(): u64 { E_NOT_INITIALIZED }

    public fun endowment_exists(): u64 { E_ENDOWMENT_EXISTS }
    public fun no_endowment(): u64 { E_NO_ENDOWMENT }
    public fun not_owner(): u64 { E_NOT_OWNER }
    public fun insufficient_balance(): u64 { E_INSUFFICIENT_BALANCE }
    public fun wrong_state(): u64 { E_WRONG_STATE }
    public fun too_early_to_renew(): u64 { E_TOO_EARLY_TO_RENEW }
    public fun expiry_did_not_advance(): u64 { E_EXPIRY_DID_NOT_ADVANCE }
    public fun cost_exceeds_cap(): u64 { E_COST_EXCEEDS_CAP }
    public fun grace_elapsed(): u64 { E_GRACE_ELAPSED }
    public fun below_min_endowment(): u64 { E_BELOW_MIN_ENDOWMENT }
    public fun target_runway_too_low(): u64 { E_TARGET_RUNWAY_TOO_LOW }

    public fun stale_price(): u64 { E_STALE_PRICE }
    public fun price_deviation(): u64 { E_PRICE_DEVIATION }
}
