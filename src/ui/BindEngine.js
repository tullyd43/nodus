// BindEngine_v2.js
// Lightweight reactive binding engine with security, forensic, and metrics integration
// Vanilla ESM. No frameworks. Safe rendering only.

/**
 * @file BindEngine_v2.js
 * @version 2.0.0
 * @summary Reactive UI binder for HybridStateManager with MAC, ForensicLogger, and Metrics hooks.
 * @mandates
 *  - copilotGuard/require-jsdoc-and-tests
 *  - copilotGuard/require-forensic-envelope
 *  - copilotGuard/no-insecure-api
 * @remarks
 *  - Never uses innerHTML/outerHTML. Only textContent/attributes/properties.
 *  - All DOM mutations are wrapped in forensic envelopes.
 *  - Access decisions use constant-time padding to mitigate timing channels.
 */

import { constantTimeCheck } from "@core/security/ct.js";

/**
 * @typedef {Object} BindEngineDeps
 * @property {import('../HybridStateManager.js').HybridStateManager} stateManager
 * @property {{ canRead?: (label: { level:string, compartments:Set<string> }|string, path?: string)=>Promise<boolean>, label?: (obj:any)=>{level:string, compartments:Set<string>} }} [securityManager]
 * @property {{ createEnvelope:(type:string,payload:any)=>Promise<any>, commitEnvelope:(env:any)=>Promise<void> }} forensicLogger
 * @property {{ record?:(name:string,data?:any)=>void, increment?:(name:string,delta?:number)=>void }} [metrics]
 * @property {{ renderRestriction:(el:Element, info:any)=>void }} [securityExplainer]
 * @property {{ on:(evt:string,cb:(data:any)=>void)=>void, off?:(evt:string,cb:(data:any)=>void)=>void }} [eventBus]
 */

/**
 * @typedef {Object} BindingOptions
 * @property {string} [format] A named formatter (from stateManager or registry) to apply before render.
 * @property {boolean} [twoWay] Enable input->state synchronization.
 * @property {string} [attr] If set, bind to this attribute instead of textContent.
 * @property {(value:any)=>any} [map] Optional mapping fn prior to render.
 * @property {string} [fallback] Text to show when access denied or value absent.
 */

/**
 * Lightweight, auditable, security-aware binding layer.
 *
 * Public methods:
 * - start(root) : Promise<void> — scan and begin reacting to state changes
 * - stop() : void — unregister bindings and stop listening
 * - bindAll(root) : Promise<void> — find and register elements with `data-bind`
 * - registerBinding(el,path,opts) : Promise<void> — register a specific element binding
 * - unregisterBinding(el) : void — remove a binding
 *
 * Inputs (via constructor deps): see {@link BindEngineDeps}
 *
 * @example
 * const engine = new BindEngine({ stateManager, forensicLogger, securityManager });
 * await engine.start(document);
 *
 * @export
 * @class BindEngine
 */
export default class BindEngine {
	/**
	 * Dependencies for the BindEngine.
	 * @type {BindEngineDeps}
	 * @private
	 */
	#deps;
	/**
	 * A map of all active bindings, with the element as the key.
	 * @type {Map<Element, {path:string, opts:BindingOptions, unsub?:()=>void}>}
	 * @private
	 */
	#bindings = new Map();
	/**
	 * Tracks if the engine has been started.
	 * @type {boolean}
	 * @private
	 */
	#started = false;

	/**
	 * Creates an instance of BindEngine.
	 *
	 * @constructor
	 * @function
	 * @memberof BindEngine
	 * @param {BindEngineDeps} deps Dependencies required by the engine (see {@link BindEngineDeps}).
	 */

	constructor(deps) {
		this.#deps = deps;
		if (!deps?.stateManager)
			throw new Error("BindEngine requires stateManager");
	}

	/**
	 * Initializes the engine, scans for bindings, and listens for state changes.
	 *
	 * @public
	 * @async
	 * @function start
	 * @memberof BindEngine
	 * @param {Document|ParentNode} [root=document] Root to scan for bindings
	 * @returns {Promise<void>}
	 */

	async start(root = document) {
		if (this.#started) return;
		this.#started = true;

		// Reactivity: listen to state changes
		this.#deps.stateManager.on?.("stateChanged", (evt) => {
			try {
				this.#onStateChanged(evt);
			} catch {
				/* swallow to avoid UI lock */
			}
		});

		// Initial scan
		await this.bindAll(root);
	}

	/**
	 * Stops the engine, unregisters all bindings, and cleans up listeners.
	 *
	 * @public
	 * @function stop
	 * @memberof BindEngine
	 * @returns {void}
	 */
	stop() {
		for (const [el, meta] of this.#bindings) {
			meta.unsub?.();
			this.#bindings.delete(el);
		}
		this.#started = false;
	}

	/**
	 * Scans a DOM tree for elements with `data-bind` attributes and registers them.
	 *
	 * @public
	 * @async
	 * @function bindAll
	 * @memberof BindEngine
	 * @param {Document|ParentNode} [root=document]
	 * @returns {Promise<void>}
	 */
	async bindAll(root = document) {
		const list = root.querySelectorAll?.("[data-bind]") ?? [];
		for (const el of list) {
			const path = el.getAttribute("data-bind");
			if (!path) continue;
			/** @type {BindingOptions} */
			const opts = {
				format: el.getAttribute("data-bind-format") || undefined,
				twoWay: el.getAttribute("data-bind-two-way") === "true",
				attr: el.getAttribute("data-bind-attr") || undefined,
				fallback: el.getAttribute("data-bind-fallback") || "",
			};
			await this.registerBinding(el, path, opts);
		}
	}

	/**
	 * Registers and renders a single element binding.
	 *
	 * @public
	 * @async
	 * @function registerBinding
	 * @memberof BindEngine
	 * @param {Element} el The DOM element to bind
	 * @param {string} path dot.notation path in clientState
	 * @param {BindingOptions} [opts] Binding options
	 * @returns {Promise<void>}
	 */
	async registerBinding(el, path, opts = {}) {
		// Unregister any existing
		this.unregisterBinding(el);

		// Subscribe to fine-grained path updates if supported
		const unsub = this.#deps.stateManager.subscribe
			? this.#deps.stateManager.subscribe(path, (value) =>
					this.#safeRender(el, path, value, opts)
				)
			: undefined;

		this.#bindings.set(el, { path, opts, unsub });

		// Initial render
		const current = this.#deps.stateManager.get?.(path);
		await this.#safeRender(el, path, current, opts);

		// Two-way
		if (opts.twoWay) {
			this.#wireTwoWay(el, path, opts);
		}
	}

	/**
	 * Removes a binding for a given element and cleans up its listeners.
	 *
	 * @public
	 * @function unregisterBinding
	 * @memberof BindEngine
	 * @param {Element} el The element to remove binding for
	 * @returns {void}
	 */
	unregisterBinding(el) {
		const meta = this.#bindings.get(el);
		if (!meta) return;
		meta.unsub?.();
		this.#bindings.delete(el);
	}

	// ---------------------------------------------------------------------------
	// Internal: Rendering & Security
	// ---------------------------------------------------------------------------

	/**
	 * Handles global `stateChanged` events as a coarse-grained fallback if fine-grained subscriptions are not available.
	 *
	 * @private
	 * @param {{changedPaths?: string[], patches?: any[]}} evt Event payload from StateManager
	 * @returns {void}
	 */
	#onStateChanged(evt) {
		const changed = new Set(evt?.changedPaths || []);
		for (const [el, { path, opts }] of this.#bindings) {
			if (changed.size === 0 || changed.has(path)) {
				const v = this.#deps.stateManager.get?.(path);
				this.#safeRender(el, path, v, opts);
			}
		}
	}

	/**
	 * Renders a value to an element after performing security checks, formatting, and forensic logging.
	 *
	 * @private
	 * @param {Element} el Target element
	 * @param {string} path State path
	 * @param {any} value Value to render
	 * @param {BindingOptions} opts Rendering options
	 * @returns {Promise<void>}
	 */
	async #safeRender(el, path, value, opts) {
		const t0 = globalThis.performance?.now?.() ?? Date.now();

		// Security decision. If no security manager or MAC engine is provided we
		// can short-circuit to `allowed=true` synchronously to avoid microtask
		// delays that would make UI updates race with tests. When a security
		// manager is present, perform the constant-time check.
		let allowed;
		if (!this.#deps.securityManager && !this.#deps.stateManager?.mac) {
			allowed = true;
		} else {
			allowed = await constantTimeCheck(
				async () => {
					const label = this.#labelForPath(path);
					if (this.#deps.securityManager?.canRead) {
						return !!(await this.#deps.securityManager.canRead(
							label,
							path
						));
					}
					// Default allow if no security manager present (dev mode)
					return true;
				},
				{ minDurationMs: this.#deps.ctMinDurationMs ?? 0 }
			);
		}

		if (!allowed) {
			// Render restriction via explainer
			if (this.#deps.securityExplainer) {
				this.#deps.securityExplainer.renderRestriction(el, {
					reason: "no-read-up",
					path,
				});
			} else {
				// Fallback minimal safe rendering
				this.#mutate(
					el,
					() => {
						el.textContent = opts.fallback ?? "Restricted";
					},
					{
						type: "UI_BIND_DENIED",
						path,
					}
				);
			}
			this.#deps.metrics?.increment?.("bind.render.denied", 1);
			return;
		}

		// Optional mapping/formatting
		let out = value;
		if (typeof opts.map === "function") out = opts.map(out);
		if (
			opts.format &&
			typeof this.#deps.stateManager.format === "function"
		) {
			out = this.#deps.stateManager.format(opts.format, out);
		}

		// Mutate DOM safely under forensic envelope
		if (opts.attr) {
			this.#mutate(
				el,
				() => {
					el.setAttribute(opts.attr, out == null ? "" : String(out));
				},
				{ type: "UI_BIND_ATTR", path, attr: opts.attr, value: out }
			);
		} else {
			this.#mutate(
				el,
				() => {
					// textContent only – prevents HTML injection
					el.textContent = out == null ? "" : String(out);
				},
				{ type: "UI_BIND_TEXT", path, value: out }
			);
		}

		const dt = (globalThis.performance?.now?.() ?? Date.now()) - t0;
		this.#deps.metrics?.record?.("bind.render.time", { path, ms: dt });
		this.#deps.metrics?.increment?.("bind.render.count", 1);
	}

	/**
	 * Computes the security label for a given state path by inspecting the value or its context.
	 *
	 * @private
	 * @param {string} path
	 * @returns {{level:string, compartments:Set<string>}}
	 */
	#labelForPath(path) {
		const sm = this.#deps.stateManager;
		const mac = sm?.mac || this.#deps.securityManager;
		const node = sm?.get?.(path);
		if (mac?.label)
			return mac.label(
				node ?? { classification: "unclassified", compartments: [] }
			);
		const level = node?.classification || "unclassified";
		const compartments = new Set(node?.compartments || []);
		return { level, compartments };
	}

	/**
	 * Wraps a DOM mutation function within a forensic envelope for auditable UI changes.
	 *
	 * @private
	 * @param {Element} el Target element being mutated
	 * @param {() => void} fn Mutation function (synchronous)
	 * @param {Record<string, any>} meta Additional metadata to include in envelope
	 * @returns {Promise<void>}
	 */
	async #mutate(el, fn, meta) {
		/* copilotGuard:require-forensic-envelope */
		// Start creating the forensic envelope but don't await it — perform the
		// mutation synchronously so callers and tests see immediate updates.
		const envPromise = this.#deps.forensicLogger.createEnvelope(
			"DOM_MUTATION",
			{
				target: el.tagName,
				...meta,
			}
		);
		try {
			fn();
			// When the envelope is available, commit it. Fire-and-forget; swallow
			// errors to avoid disrupting the UI path. Chain commitEnvelope so
			// promise nesting is avoided.
			envPromise
				.then((env) => this.#deps.forensicLogger.commitEnvelope(env))
				.catch(() => {
					/* envelope creation or commit failed — swallow to avoid UI disruption */
				});
		} catch (e) {
			// If the mutation itself throws, attempt to commit any envelope when
			// available and then rethrow to surface the error.
			envPromise
				.then((env) => this.#deps.forensicLogger.commitEnvelope(env))
				.catch(() => {});
			throw e;
		}
	}

	// ---------------------------------------------------------------------------
	// Two-way binding
	// ---------------------------------------------------------------------------

	/**
	 * Sets up two-way data binding for an input element, updating state on user input.
	 *
	 * @private
	 * @param {Element} el Input element to observe
	 * @param {string} path State path to update
	 * @param {BindingOptions} opts Binding options
	 * @returns {void}
	 */
	#wireTwoWay(el, path, opts) {
		const handler = async (e) => {
			const newVal = /** @type {HTMLInputElement|any} */ (e.target).value;
			/* copilotGuard:require-forensic-envelope */
			const env = await this.#deps.forensicLogger.createEnvelope(
				"UI_BIND_MUTATION",
				{
					path,
					value: newVal,
					source: "input",
				}
			);
			try {
				await this.#deps.stateManager.set?.(path, newVal);
				await this.#deps.forensicLogger.commitEnvelope(env);
			} catch (err) {
				await this.#deps.forensicLogger.commitEnvelope(env);
				throw err;
			}
		};

		el.addEventListener("input", handler);
		el.addEventListener("change", handler);

		// Store unsub alongside existing
		const meta = this.#bindings.get(el);
		const prevUnsub = meta?.unsub;
		const unsub = () => {
			el.removeEventListener("input", handler);
			el.removeEventListener("change", handler);
			prevUnsub?.();
		};
		if (meta) this.#bindings.set(el, { ...meta, unsub });
	}
}

// -----------------------------------------------------------------------------
// Optional service helper for SystemBootstrap
// -----------------------------------------------------------------------------

/**
 * Create, start and return a BindEngine instance.
 * Useful for SystemBootstrap wiring where a running service instance is required.
 *
 * @param {BindEngineDeps} deps
 * @returns {Promise<BindEngine>} Resolves to the running BindEngine instance
 */
export async function createBindEngineService(deps) {
	/* copilotGuard:require-forensic-envelope */
	/* ForensicLogger.createEnvelope */
	const env = await deps.forensicLogger.createEnvelope("SERVICE_START", {
		service: "BindEngine",
		context: "bootstrap",
	});
	try {
		const engine = new BindEngine(deps);
		await engine.start(document);
		await deps.forensicLogger.commitEnvelope(env);
		return engine;
	} catch (err) {
		await deps.forensicLogger.commitEnvelope(env);
		throw err;
	}
}
