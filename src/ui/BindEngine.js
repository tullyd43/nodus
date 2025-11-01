// src/ui/BindEngine.js
// Lightweight DOM binding engine: registers elements with `data-bind` and
// populates them from `stateManager.clientState` or via `QueryService`.
export class BindEngine {
	/**
	 * Create a BindEngine.
	 * @param {Object} stateManager - HybridStateManager instance exposing managers/events.
	 */
	constructor(stateManager) {
		this.stateManager = stateManager;
		this.bindings = new Map();
	}

	/**
	 * Initialize the engine by registering existing [data-bind] elements under root.
	 * @param {Document|Element} [root=document]
	 */
	init(root = document) {
		root.querySelectorAll("[data-bind]").forEach((el) => this.register(el));
	}

	/**
	 * Register a single element that uses data-bind so it receives updates.
	 * This is useful for dynamically created elements.
	 * @param {HTMLElement} el
	 */
	register(el, definition = {}) {
		if (!el || !el.dataset) return;
		// Allow programmatic definition override (register(el, { bindingPath }) )
		const path =
			el.dataset.bind ||
			definition?.bindingPath ||
			definition?.bind ||
			"";
		if (!path) return;
		if (this.bindings.has(el)) return; // already registered

		const securityManager = this.stateManager?.managers?.securityManager;
		const _checkCanRead = (p) => {
			try {
				const res =
					typeof securityManager?.canRead === "function"
						? securityManager.canRead(p)
						: true;
				// support sync boolean or Promise<boolean>
				if (res && typeof res.then === "function")
					return res.catch(() => false);
				return Promise.resolve(Boolean(res));
			} catch (e) {
				return Promise.resolve(false);
			}
		};

		// Helper: clear children safely
		const _clearChildren = (node) => {
			while (node.firstChild) node.removeChild(node.firstChild);
		};

		// Async registration flow to avoid nested promises and allow awaiting canRead.
		let disposed = false;
		const markDisposed = () => {
			disposed = true;
		};

		(async () => {
			const allowed = await _checkCanRead(path);
			if (!allowed) {
				// Render a safe restricted placeholder instead of exposing data.
				try {
					if (el.matches && el.matches("input, textarea, select")) {
						// For form controls show a restricted placeholder and disable interaction.
						el.value = "";
						el.placeholder = "Restricted";
						el.disabled = true;
						el.setAttribute("data-restricted", "true");
					} else {
						_clearChildren(el);
						const stub = document.createElement("span");
						stub.className = "restricted";
						stub.textContent = "Restricted";
						el.appendChild(stub);
						el.setAttribute("data-restricted", "true");
					}
				} catch {
					// ignore failures when attempting to render placeholder
				}
				// Store a no-op unsubscriber so unregister works predictably.
				this.bindings.set(el, () => markDisposed());
				return;

			// If this is a query-based binding, fetch results and populate.
			if (path.startsWith("query:")) {
				const queryString = path.slice("query:".length).trim();
				const qsvc = this.stateManager?.managers?.queryService;
				if (qsvc && typeof qsvc.search === "function") {
					try {
						const results = await qsvc.search(queryString);
						if (disposed) return;
						if (!results || !results.length) {
							// no-op
						} else if (el.matches && el.matches("select")) {
							_clearChildren(el);
							const frag = document.createDocumentFragment();
							results.forEach((r) => {
								const opt = document.createElement("option");
								opt.value =
									r.id ?? r.value ?? JSON.stringify(r);
								opt.textContent =
									r.title ||
									r.name ||
									String(r.value ?? r.id ?? r);
								frag.appendChild(opt);
							});
							el.appendChild(frag);
						} else if (el.matches && el.matches("ul, ol")) {
							_clearChildren(el);
							const frag = document.createDocumentFragment();
							results.forEach((r) => {
								const li = document.createElement("li");
								li.textContent =
									r.title ||
									r.name ||
									String(r.value ?? r.id ?? r);
								frag.appendChild(li);
							});
							el.appendChild(frag);
						} else {
							const r = results[0];
							if (r != null) {
								if (
									el.matches &&
									el.matches("input, textarea, select")
								) {
									if (document.activeElement !== el)
										el.value = this._format(
											r.title ??
												r.name ??
												r.value ??
												r.id ??
												r
										);
								} else {
									el.textContent = this._format(
										r.title ??
											r.name ??
											r.value ??
											r.id ??
											r
									);
								}
							}
						}
					} catch (e) {
						// best-effort
					}
				}
			}

			// Initial population from client state
			try {
				const clientState = this.stateManager?.clientState || {};
				let initial = undefined;

				if (path.startsWith("entities.")) {
					const parts = path.split(".");
					const id = parts[1];
					const propPath = parts.slice(2).join(".");
					const entities = clientState.entities;
					let entity = undefined;
					if (entities) {
						if (typeof entities.get === "function")
							entity = entities.get(id);
						else entity = entities[id] || undefined;
					}
					if (entity && propPath) {
						initial = propPath
							.split(".")
							.reduce(
								(cur, k) =>
									cur && cur[k] !== undefined
										? cur[k]
										: undefined,
								entity
							);
					} else if (entity) {
						initial = entity;
					}
				} else {
					const parts = path.split(".");
					let cur = clientState;
					for (const p of parts) {
						if (cur == null) {
							cur = undefined;
							break;
						}
						if (typeof cur.get === "function") cur = cur.get(p);
						else cur = cur[p];
					}
					initial = cur;
				}

				if (initial !== undefined) {
					if (el.matches && el.matches("input, textarea, select")) {
						if (document.activeElement !== el)
							el.value = this._format(initial);
					} else {
						el.textContent = this._format(initial);
					}
				}
			} catch (e) {
				// best-effort
			}

			// Subscribe to state changes to keep element in sync
			const unsub = this.stateManager.on(
				"stateChange",
				({ path: changed, value }) => {
					if (changed === path && !disposed) {
						if (
							el.matches &&
							el.matches("input, textarea, select")
						) {
							if (document.activeElement !== el)
								el.value = this._format(value);
						} else {
							el.textContent = this._format(value);
						}
					}
				}
			);

			this.bindings.set(el, () => {
				markDisposed();
				if (typeof unsub === "function")
					try {
						unsub();
					} catch (e) {}
			});
		})();
	}

	/**
	 * Unregister a previously registered element.
	 * @param {HTMLElement} el
	 */
	unregister(el) {
		const unsub = this.bindings.get(el);
		if (typeof unsub === "function") unsub();
		this.bindings.delete(el);
	}

	_format(v) {
		return v == null ? "" : String(v);
	}

	/**
	 * Dispose this engine and remove all registrations.
	 */
	dispose() {
		for (const unsub of this.bindings.values())
			if (typeof unsub === "function") unsub();
		this.bindings.clear();
	}
}
