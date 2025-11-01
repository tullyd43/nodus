// src/core/ui/SecurityExplainer.js
// Dev-only security HUD to explain why rows are hidden/merged/filtered.
// Listens to HybridStateManager + StorageLoader events and renders a floating panel.
// Toggle: window.__securityHUD?.toggle()

export class SecurityExplainer {
	/**
	 * @param {object} opts
	 * @param {object} opts.hybridStateManager
	 * @param {boolean} [opts.startOpen=false]
	 * @param {('bottom-right'|'bottom-left'|'top-right'|'top-left')} [opts.position='bottom-right']
	 */
	constructor({
		hybridStateManager,
		startOpen = false,
		position = "bottom-right",
	}) {
		if (!hybridStateManager)
			throw new Error("SecurityExplainer: hybridStateManager required");
		this.hsm = hybridStateManager;
		this.position = position;
		this.events = [];
		this.maxEvents = 200;

		this._panel = this._buildPanel();
		document.body.appendChild(this._panel);
		if (!startOpen) this._panel.classList.add("collapsed");

		this._unsubs = [
			this.hsm.on?.("securityEvent", (e) => this._log("SEC", e)),
			this.hsm.on?.("entitySaved", (e) => this._log("SAVE", e)),
			this.hsm.on?.("entityDeleted", (e) => this._log("DEL", e)),
			this.hsm.on?.("macDecision", (e) => this._log("MAC", e)),
			this.hsm.storage?.instance?.stateManager?.on?.("polyMerge", (e) =>
				this._log("POLY", e)
			),
		].filter(Boolean);

		// global toggle hook
		if (!window.__securityHUD) {
			window.__securityHUD = {
				toggle: () => this.toggle(),
				clear: () => this.clear(),
			};
		}
	}

	dispose() {
		for (const u of this._unsubs)
			try {
				u();
			} catch {
				// no-op: Unsubscribe may fail if the underlying system is already torn down.
			}
		this._panel.remove();
	}

	toggle() {
		this._panel.classList.toggle("collapsed");
	}

	clear() {
		this.events.length = 0;
		this._panel.querySelector(".sec-body").innerHTML = "";
	}

	_buildPanel() {
		const panel = document.createElement("div");
		panel.className = `sec-hud ${this.position}`;
		panel.innerHTML = `
      <style>
        .sec-hud {
          position: fixed; font: 12px/1.4 system-ui,Segoe UI,Roboto,Arial;
          background: rgba(10,10,14,.92); color:#d5e1ff; width: 420px; max-height: 50vh;
          border:1px solid #2b3552; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.45);
          overflow: hidden; z-index: 99999; backdrop-filter: blur(6px)
        }
        .sec-hud.bottom-right { right: 16px; bottom: 16px; }
        .sec-hud.bottom-left { left: 16px; bottom: 16px; }
        .sec-hud.top-right { right: 16px; top: 16px; }
        .sec-hud.top-left { left: 16px; top: 16px; }
        .sec-hud.collapsed .sec-body { display:none }
        .sec-header { display:flex; align-items:center; gap:8px; padding:8px 10px; background:#0f1424; border-bottom:1px solid #2b3552 }
        .sec-header .title { font-weight: 700; letter-spacing:.2px; flex:1 }
        .sec-header button { background:#1a2442; color:#c6d4ff; border:1px solid #2b3552; border-radius:6px; padding:4px 8px; cursor:pointer }
        .sec-body { overflow:auto; max-height: calc(50vh - 40px); }
        .sec-row { display:grid; grid-template-columns: 60px 56px 1fr; gap:8px; padding:8px 10px; border-bottom:1px dashed #2b3552 }
        .tag { font-weight:700; color:#93b4ff }
        .pill { padding:0 6px; border-radius: 6px; display:inline-block; border:1px solid #2b3552; background:#131b31; font-size: 11px; color:#a3baff }
        .muted { color:#7b88a8 }
        .level-U { color:#a0ffd1 } .level-C { color:#ffd48a } .level-S { color:#ff9aa2 } .level-NS { color:#fca0ff }
        .kv { display:flex; gap:6px; flex-wrap: wrap }
        .kv .k { color:#8aa3ff } .kv .v { color:#c7d4ff }
        .monos { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px }
      </style>
      <div class="sec-header">
        <div class="title">Security Explainer</div>
        <button data-cmd="collapse">Toggle</button>
        <button data-cmd="clear">Clear</button>
      </div>
      <div class="sec-body"></div>
    `;
		panel
			.querySelector('[data-cmd="collapse"]')
			.addEventListener("click", () => this.toggle());
		panel
			.querySelector('[data-cmd="clear"]')
			.addEventListener("click", () => this.clear());
		return panel;
	}

	_log(tag, payload) {
		const evt = { ts: Date.now(), tag, payload };
		this.events.push(evt);
		if (this.events.length > this.maxEvents) this.events.shift();
		this._appendRow(evt);
	}

	_appendRow({ ts, tag, payload }) {
		const body = this._panel.querySelector(".sec-body");
		const row = document.createElement("div");
		row.className = "sec-row";

		const when = new Date(ts).toLocaleTimeString();
		const klass = (lvl) => {
			const v = String(lvl || "").toLowerCase();
			if (v.includes("nato")) return "level-NS";
			if (v.startsWith("secret")) return "level-S";
			if (v.startsWith("confidential")) return "level-C";
			return "level-U";
		};

		// derive label quickly if present
		const lvl =
			payload?.label?.level ??
			payload?.derivedLabel?.level ??
			payload?.objectLabel?.level ??
			payload?.entity?.classification ??
			payload?.classification_level ??
			"unclassified";

		row.innerHTML = `
      <div class="muted monos">${when}</div>
      <div class="tag ${klass(lvl)}">${tag}</div>
      <div>
        <div class="kv">
          ${this._kv("level", lvl)}
          ${this._kv("compartments", (payload?.label?.compartments ?? payload?.compartments ?? []).join(","))}
          ${payload?.logical_id ? this._kv("logical_id", payload.logical_id) : ""}
          ${payload?.id ? this._kv("id", payload.id) : ""}
          ${payload?.operation ? this._kv("op", payload.operation) : ""}
          ${payload?.reason ? this._kv("reason", payload.reason) : ""}
        </div>
        ${payload?.explain ? `<div class="muted monos">${payload.explain}</div>` : ""}
      </div>
    `;
		body.appendChild(row);
		body.scrollTop = body.scrollHeight;
	}

	_kv(k, v) {
		if (v == null || v === "") return "";
		return `<span class="pill"><span class="k">${k}:</span> <span class="v monos">${String(v)}</span></span>`;
	}
}

export default SecurityExplainer;
