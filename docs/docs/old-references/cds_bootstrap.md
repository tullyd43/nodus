# CDS Bootstrap / index.html snippet

To enable real network access for the in-repo CDS wrapper without sprinkling `fetch` calls through library code,
set a platform-provided native transport before the application bootstraps. The application will look for
`globalThis.__NODUS_NATIVE_FETCH__` and wire it into the CDS transport.

Example snippet to include in `index.html` (place before your bundled script):

```html
<script>
	// In the browser environment, expose the native fetch as the app's allowed native transport.
	// This keeps raw fetch usage out of the source tree and centralized in the platform bootstrap.
	globalThis.__NODUS_NATIVE_FETCH__ = window.fetch.bind(window);
</script>
```

Alternative (server-proxy):

If you prefer all network traffic to go through a server-side CDS proxy, implement a server route (for example `/cds-proxy`) and then set a proxy transport in `SystemBootstrap` or `AppConfig`:

```js
// in your server-side bootstrap
globalThis.__NODUS_NATIVE_FETCH__ = window.fetch.bind(window);

// or configure AppConfig.cdsTransport to point to a proxy adapter
// AppConfig.cdsTransport = createProxyTransport({ proxyEndpoint: '/cds-proxy' });
```

This approach keeps network policy centralized and makes it easy to enforce sanitization and auditing server-side.

How it works (quick contract)
Inputs: client code calls CDS.fetch(url, opts) or CDS.fetchXHR(url, opts).
Delegation: CDS validates URL and delegates to globalThis.__NODUS_CDS_TRANSPORT__.
Transport resolution:
SystemBootstrap will set globalThis.__NODUS_CDS_TRANSPORT__ during initialization in this order:
If AppConfig.cdsProxyEndpoint is set and globalThis.__NODUS_NATIVE_FETCH__ exists, wire a proxy transport that posts to the proxy endpoint (server-side forwarding).
Else use AppConfig.cdsTransport if it’s a function or createDefaultTransport(nativeFetch) from globalThis.__NODUS_NATIVE_FETCH__.
Else CDS returns a safe stub (no network).
Server proxy endpoint: POST /api/cds/proxy — expects JSON { url, init }. Server forwards request and returns minimal response {status, headers, body}.
How to enable network access in dev
Option A — Browser bootstrap (fast)

Add to your index.html before app bundle:<script> globalThis.__NODUS_NATIVE_FETCH__ = window.fetch.bind(window); </script> This keeps fetch out of library source and lets SystemBootstrap wire transports.
Option B — Server proxy (controlled)

The default environment.config.js contains cdsProxyEndpoint: '/api/cds/proxy'.
Ensure the node server (index.js) is running; it mounts /api/cds and our proxy route /api/cds/proxy.
The proxy will forward allowed requests to remote URLs, sanitize some headers, and return the remote body back to the client.
Commands
Run tests:
npm ci
npx vitest run CDS.test.js
Start server (dev):
From repo root run (PowerShell):
Then open your app in browser (Vite dev server if applicable).
Security & notes
The proxy strips Authorization/Cookie headers and only supports http/https, but it’s intentionally minimal. For production you should:
Add robust input validation, allowlisting of destinations, rate-limiting, and authentication for proxy usage.
For sensitive operations, log (via ForensicLogger) each proxied request with classification labels and signatures.
Enforce server-side sanitization policies before returning proxied content.
The code avoids direct fetch in library modules to comply with project mandates; the single globalThis.__NODUS_NATIVE_FETCH__ hook should be the only place where platform fetch is introduced.