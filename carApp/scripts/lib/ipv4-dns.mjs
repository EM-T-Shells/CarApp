/**
 * ipv4-dns.mjs — force IPv4 name resolution for this process.
 *
 * WHY THIS EXISTS
 *
 * On WSL2 (and some corporate/VPN resolvers) an AAAA query for a host that has
 * no IPv6 record is simply never answered, so `dns.lookup(host)` — which asks
 * for A and AAAA together and waits for both — blocks until the resolver's own
 * timeout, about 11 seconds here. undici's connect timeout is 10 seconds, so
 * every `fetch()` to such a host dies with UND_ERR_CONNECT_TIMEOUT *before*
 * resolution finishes.
 *
 * That failure is deeply misleading: raw `net.connect`, `tls.connect`, `curl`
 * and the Supabase CLI all work against the same host, because they either take
 * an IP directly or use the system resolver instead of `dns.lookup`. Only Node's
 * fetch breaks, and it reports it as a *connection* timeout rather than a DNS
 * stall. Measured on this project's host:
 *
 *   net.connect({ host })            11091 ms
 *   net.connect({ host, family: 4 })    64 ms
 *
 * Hosts that DO have AAAA records (example.com, mcp.supabase.com) are fast,
 * which is what makes it look like a Supabase-specific outage rather than a
 * resolver quirk. It is neither — it is IPv4-only hosts specifically.
 *
 * Patching `dns.lookup` rather than passing `family: 4` per call is deliberate:
 * the stall happens inside `net.connect`, which supabase-js reaches through
 * undici, and there is no public API to hand connect options down that far.
 *
 * Node-side scripts only. This never ships in the app bundle — React Native has
 * its own networking stack and no `node:dns`.
 */
import dns from 'node:dns';

const originalLookup = dns.lookup;

dns.lookup = function ipv4OnlyLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const opts = typeof options === 'number' ? { family: options } : { ...options };
  // Only force a family when the caller did not ask for one. A deliberate
  // family: 6 stays honoured, so this cannot silently break IPv6-only targets.
  if (!opts.family) opts.family = 4;
  return originalLookup.call(this, hostname, opts, callback);
};

// dns.promises has its own independent implementation.
const originalPromisesLookup = dns.promises.lookup;
dns.promises.lookup = function ipv4OnlyLookupAsync(hostname, options = {}) {
  const opts = typeof options === 'number' ? { family: options } : { ...options };
  if (!opts.family) opts.family = 4;
  return originalPromisesLookup.call(this, hostname, opts);
};
