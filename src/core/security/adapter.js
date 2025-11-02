// Re-export shim: forward adapter utilities to their new platform location.
import { createProxyTransport } from "../../platform/security/adapter.js";

export { createProxyTransport };
export default createProxyTransport;
