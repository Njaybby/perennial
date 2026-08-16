/// Storage cost and runway math.
/// Fixed point on PRICE_SCALE so small blobs don't round burn_per_sec to zero.
/// Under a real Shelby integration this price is a forward-looking estimate, since Shelby quotes the true cost at payment time.
/// Standing in for ShelbyUSD until that FA address exists, the price and vault balances in this build are denominated in the same base units as APT octas.
module perennial::pricing {
    use aptos_framework::timestamp;
    use perennial::errors;

    const PRICE_SCALE: u128 = 1_000_000_000_000;
    const MAX_U64: u128 = 18446744073709551615;

    struct Price has key {
        price_per_byte_per_sec: u128,
        updated_at_secs: u64,
        max_staleness_secs: u64,
        max_deviation_bps: u16,
        feeder: address,
    }

    public entry fun init_price(
        owner: &signer,
        initial_price: u128,
        max_staleness_secs: u64,
        max_deviation_bps: u16,
        feeder: address,
    ) {
        assert!(!exists<Price>(std::signer::address_of(owner)), errors::already_initialized());
        move_to(owner, Price {
            price_per_byte_per_sec: initial_price,
            updated_at_secs: timestamp::now_seconds(),
            max_staleness_secs,
            max_deviation_bps,
            feeder,
        });
    }

    public entry fun set_price(feeder: &signer, price_addr: address, new_price: u128) acquires Price {
        let p = borrow_global_mut<Price>(price_addr);
        assert!(std::signer::address_of(feeder) == p.feeder, errors::not_admin());
        let deviation_bps = if (new_price >= p.price_per_byte_per_sec) {
            ((new_price - p.price_per_byte_per_sec) * 10_000) / p.price_per_byte_per_sec
        } else {
            ((p.price_per_byte_per_sec - new_price) * 10_000) / p.price_per_byte_per_sec
        };
        assert!(deviation_bps <= (p.max_deviation_bps as u128), errors::price_deviation());
        p.price_per_byte_per_sec = new_price;
        p.updated_at_secs = timestamp::now_seconds();
    }

    #[view]
    public fun current_price(price_addr: address): u128 acquires Price {
        borrow_global<Price>(price_addr).price_per_byte_per_sec
    }

    #[view]
    public fun is_stale(price_addr: address): bool acquires Price {
        let p = borrow_global<Price>(price_addr);
        timestamp::now_seconds() > p.updated_at_secs + p.max_staleness_secs
    }

    #[view]
    public fun burn_per_sec(price_addr: address, size_bytes: u64): u64 acquires Price {
        let price = borrow_global<Price>(price_addr).price_per_byte_per_sec;
        let burn = ((size_bytes as u128) * price + PRICE_SCALE - 1) / PRICE_SCALE;
        if (burn > MAX_U64) (MAX_U64 as u64) else (burn as u64)
    }

    #[view]
    public fun cost(price_addr: address, size_bytes: u64, duration_secs: u64): u64 acquires Price {
        let price = borrow_global<Price>(price_addr).price_per_byte_per_sec;
        let numerator = (size_bytes as u128) * (duration_secs as u128) * price;
        let c = (numerator + PRICE_SCALE - 1) / PRICE_SCALE;
        if (c > MAX_U64) (MAX_U64 as u64) else (c as u64)
    }

    #[view]
    public fun cost_with_cap(price_addr: address, size_bytes: u64, duration_secs: u64, cap: u64): u64 acquires Price {
        let c = cost(price_addr, size_bytes, duration_secs);
        if (c > cap) cap else c
    }

    #[view]
    public fun runway_secs(price_addr: address, balance: u64, size_bytes: u64): u64 acquires Price {
        let bps = burn_per_sec(price_addr, size_bytes);
        if (bps == 0) {
            (MAX_U64 as u64)
        } else {
            balance / bps
        }
    }
}
