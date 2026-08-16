# THREAT MODEL

What this build does and doesn't defend against. Stated plainly rather than buried, because several of these are real and unresolved.

## Not defended against in this build

Gateway fabricates or misattributes revenue
: `endowment::credit` is called directly by a single registered gateway address, with no proof layer behind it. A trust-minimised metering design exists but is not implemented here. Bounded only by the fact that `credit` withdraws the credited amount from the gateway's own balance, so it's the gateway's own funds being moved, not a claim on anyone else's. Acceptable for a demo where the gateway is our own script simulating reads. Not acceptable to ship.

Gateway withholds revenue it collected
: Not prevented, and not fully preventable on chain in any version of this design. Mitigated in principle by gateways being permissionless and readers being able to pick one.

Single gateway address is a centralization point
: `registry::gateway` is one address, set by admin. Compromising it, or the admin key that can call `set_gateway`, allows crediting arbitrary blobs. Same bound as above: the attacker spends their own funds to do it.

Price oracle manipulation
: Bounded by `pricing::set_price`'s `max_deviation_bps` check and the `max_staleness_secs` staleness guard, but in this build `pricing` is the actual cost source for `renew` rather than an advisory forecast checked against a real quote. A compromised `feeder` key directly affects renewal cost. `feeder` is the admin key in this deployment. Rotate it before this is anything but a demo.

Reader key compromise
: No receipt-signing layer exists in this build, so there is nothing here to scope or expire yet.

## Not applicable to this build

Keeper lies about a renewal
: `renew` makes no external call. It debits the vault and advances `expires_at_secs` entirely within `move/perennial`, so there is nothing for a keeper to misreport. The keeper's only power is *when* it calls `renew`, not what `renew` records.

Griefer top-ups to inflate demand ranking
: `top_up` never touches `lifetime_revenue`; only `credit` does. Ranking in this build reads lifetime revenue, so top-ups cannot move it.

Owner drains their own endowment via split manipulation
: `set_split` only affects revenue credited after it's called, never retroactively. The starved-vault override in `credit` can't be bypassed by setting a low target, because `seed` and `set_target_runway` both assert `target_runway_secs >= renewal_lead_secs * 2`.

Front-running a renewal to steal the keeper bounty
: Acceptable. The work is permissionless; whoever lands the transaction did the job.

Devnet reset destroys state
: Expected, not a threat. `pnpm reset` then `pnpm run deploy` then `pnpm demo` rebuilds everything from nothing. No on-chain state here is treated as irreplaceable.

## Known placeholders

`renew`'s payment destination
: The `cost` portion of a renewal is routed to `treasury` rather than to Shelby, because there's no reachable Shelby payment function yet. Economically inert for the demo, since treasury is the admin account either way, but it must change before any real integration. Flagged in the `endowment::renew` comment so it isn't missed.

No wallet connection
: Dashboard actions sign with demo server-side keys. See `docs/DECISIONS.md`.
