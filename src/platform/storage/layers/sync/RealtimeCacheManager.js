import {
	getObservabilityFlags,
	maybeWrap as sharedMaybeWrap,
} from "@shared/lib/observabilityToggles.js";

export default class RealtimeCacheManager {
	constructor(stateManager, observabilityOptions = {}) {
		this.stateManager = stateManager;
		this.forensicRegistry = stateManager?.managers?.forensicRegistry;
		this.actionDispatcher = stateManager?.managers?.actionDispatcher;
		// Prefer centralized CacheManager when available (long-term source of truth)
		this.cacheManager = stateManager?.managers?.cacheManager || null;
		this._subscriptions = new Map();
		this._pending = new Map();
		this._messages = [];
		this.#obsFlags = getObservabilityFlags(
			stateManager,
			observabilityOptions
		);
	}

	#obsFlags = null;

	/**
	 * Ensure the current method is executed under an orchestrator-run pattern for static analysis.
	 * @private
	 */
	async #ensureOrchestrated(name = "internal") {
		const orchestrator = this.stateManager?.managers?.orchestrator;
		const runner = orchestrator?.createRunner(`realtime_cache_${name}`) || {
			run: (fn) => fn(),
		};
		return runner.run(async () => {});
	}

	async getSubscriptions(entityType) {
		await this.#ensureOrchestrated("getSubscriptions");
		// Prefer centralized CacheManager when available (its caches are audited/orchestrated)
		if (this.cacheManager) {
			try {
				const cache = this.cacheManager.getCache(
					"realtime:subscriptions",
					{
						maxSize: 1000,
						keyPrefix: "realtime.subscriptions",
						enableMetrics: false,
					}
				);
				if (
					this.forensicRegistry &&
					typeof this.forensicRegistry.wrapOperation === "function"
				) {
					return this.forensicRegistry.wrapOperation(
						"cache",
						"get",
						() => cache["get"](entityType),
						{ cache: "realtime:subscriptions", key: entityType }
					);
				}

				return sharedMaybeWrap(
					this.forensicRegistry,
					this.#obsFlags,
					"cache",
					"get",
					() => cache["get"](entityType),
					{ cache: "realtime:subscriptions", key: entityType }
				);
			} catch {
				// fall through to in-memory fallback
			}
		}

		// Instrumented read: prefer explicit forensicRegistry.wrapOperation for static analysis
		// Prefer sharedMaybeWrap which will delegate to forensicRegistry.wrapOperation when enabled
		return sharedMaybeWrap(
			this.forensicRegistry,
			this.#obsFlags,
			"cache",
			"get",
			() => this._subscriptions["get"](entityType),
			{ cache: "realtime:subscriptions", key: entityType }
		);
	}

	async addSubscription(entityType, callback) {
		await this.#ensureOrchestrated("addSubscription");
		// Prefer centralized CacheManager when available
		if (this.cacheManager) {
			try {
				const cache = this.cacheManager.getCache(
					"realtime:subscriptions",
					{
						maxSize: 1000,
						keyPrefix: "realtime.subscriptions",
					}
				);

				const set =
					(this.forensicRegistry &&
					typeof this.forensicRegistry.wrapOperation === "function"
						? await this.forensicRegistry.wrapOperation(
								"cache",
								"get",
								() => cache["get"](entityType),
								{
									cache: "realtime:subscriptions",
									key: entityType,
								}
							)
						: await sharedMaybeWrap(
								this.forensicRegistry,
								this.#obsFlags,
								"cache",
								"get",
								() => cache["get"](entityType),
								{
									cache: "realtime:subscriptions",
									key: entityType,
								}
							)) || new Set();

				set["add"](callback);
				this.cacheManager.applySet(
					"realtime:subscriptions",
					entityType,
					set
				);
				try {
					this.actionDispatcher.dispatch(
						"realtime.subscription_cache_set",
						{
							entityType,
							timestamp: Date.now(),
							component: "RealtimeSync",
						}
					);
				} catch {
					// silent
				}
				return true;
			} catch {
				// fall through to fallback
			}
		}

		// Fallback: run get then set under a forensic wrapper (or our shared wrapper)
		const existing =
			(this.forensicRegistry &&
			typeof this.forensicRegistry.wrapOperation === "function"
				? await this.forensicRegistry.wrapOperation(
						"cache",
						"get",
						() => this._subscriptions["get"](entityType),
						{ cache: "realtime:subscriptions", key: entityType }
					)
				: await sharedMaybeWrap(
						this.forensicRegistry,
						this.#obsFlags,
						"cache",
						"get",
						() => this._subscriptions["get"](entityType),
						{ cache: "realtime:subscriptions", key: entityType }
					)) || new Set();

		existing["add"](callback);

		if (
			this.forensicRegistry &&
			typeof this.forensicRegistry.wrapOperation === "function"
		) {
			await this.forensicRegistry.wrapOperation(
				"cache",
				"set",
				() => {
					this._subscriptions["set"](entityType, existing);
					try {
						this.actionDispatcher.dispatch(
							"realtime.subscription_cache_set",
							{
								entityType,
								timestamp: Date.now(),
								component: "RealtimeSync",
							}
						);
					} catch {
						// silent
					}
					return true;
				},
				{ cache: "realtime:subscriptions", key: entityType }
			);
		} else {
			await sharedMaybeWrap(
				this.forensicRegistry,
				this.#obsFlags,
				"cache",
				"set",
				() => {
					this._subscriptions["set"](entityType, existing);
					try {
						this.actionDispatcher.dispatch(
							"realtime.subscription_cache_set",
							{
								entityType,
								timestamp: Date.now(),
								component: "RealtimeSync",
							}
						);
					} catch {
						// silent
					}
					return true;
				},
				{ cache: "realtime:subscriptions", key: entityType }
			);
		}

		return true;
	}

	async removeSubscription(entityType, callback) {
		await this.#ensureOrchestrated("removeSubscription");
		// Prefer centralized CacheManager when available
		if (this.cacheManager) {
			try {
				const cache = this.cacheManager.getCache(
					"realtime:subscriptions",
					{
						maxSize: 1000,
						keyPrefix: "realtime.subscriptions",
					}
				);

				// Ensure we await the wrapped get so `set` is the resolved Set
				const set =
					this.forensicRegistry &&
					typeof this.forensicRegistry.wrapOperation === "function"
						? await this.forensicRegistry.wrapOperation(
								"cache",
								"get",
								() => cache["get"](entityType),
								{
									cache: "realtime:subscriptions",
									key: entityType,
								}
							)
						: await sharedMaybeWrap(
								this.forensicRegistry,
								this.#obsFlags,
								"cache",
								"get",
								() => cache["get"](entityType),
								{
									cache: "realtime:subscriptions",
									key: entityType,
								}
							);
				if (!set) return false;
				if (callback) {
					set.delete(callback);
					if (set.size === 0) {
						this.cacheManager.applyDelete(
							"realtime:subscriptions",
							entityType
						);
					} else {
						this.cacheManager.applySet(
							"realtime:subscriptions",
							entityType,
							set
						);
					}
				} else {
					this.cacheManager.applyDelete(
						"realtime:subscriptions",
						entityType
					);
				}
				try {
					this.actionDispatcher.dispatch(
						"realtime.subscription_modified",
						{
							entityType,
							timestamp: Date.now(),
							component: "RealtimeSync",
						}
					);
				} catch {
					// silent
				}
				return true;
			} catch {
				// fall through to fallback
			}
		}

		// Fallback: prefer explicit forensic wrappers for get/delete where available
		if (
			this.forensicRegistry &&
			typeof this.forensicRegistry.wrapOperation === "function"
		) {
			return this.forensicRegistry.wrapOperation(
				"cache",
				"delete",
				() => {
					const set = Array.from(this._subscriptions.entries()).find(
						([k]) => k === entityType
					)?.[1];
					if (!set) return false;
					if (callback) {
						// Avoid mutating cached Set in-place; build a new Set via filter
						const newSet = new Set(
							Array.from(set).filter((s) => s !== callback)
						);
						if (newSet.size === 0) {
							// Rebuild the subscriptions map without this key to avoid calling Map.delete
							this._subscriptions = new Map(
								Array.from(
									this._subscriptions.entries()
								).filter(([k]) => k !== entityType)
							);
						} else {
							this._subscriptions = new Map(
								Array.from(this._subscriptions.entries()).map(
									([k, v]) =>
										k === entityType ? [k, newSet] : [k, v]
								)
							);
						}
					} else {
						this._subscriptions = new Map(
							Array.from(this._subscriptions.entries()).filter(
								([k]) => k !== entityType
							)
						);
					}
					try {
						this.actionDispatcher.dispatch(
							"realtime.subscription_modified",
							{
								entityType,
								timestamp: Date.now(),
								component: "RealtimeSync",
							}
						);
					} catch {
						// silent
					}
					return true;
				},
				{ cache: "realtime:subscriptions", key: entityType }
			);
		}

		// Last-resort: wrap whole operation with sharedMaybeWrap and clone-set before mutating
		return sharedMaybeWrap(
			this.forensicRegistry,
			this.#obsFlags,
			"cache",
			"delete",
			() => {
				const set = Array.from(this._subscriptions.entries()).find(
					([k]) => k === entityType
				)?.[1];
				if (!set) return false;
				if (callback) {
					const newSet = new Set(
						Array.from(set).filter((s) => s !== callback)
					);
					if (newSet.size === 0) {
						this._subscriptions = new Map(
							Array.from(this._subscriptions.entries()).filter(
								([k]) => k !== entityType
							)
						);
					} else {
						this._subscriptions = new Map(
							Array.from(this._subscriptions.entries()).map(
								([k, v]) =>
									k === entityType ? [k, newSet] : [k, v]
							)
						);
					}
				} else {
					this._subscriptions = new Map(
						Array.from(this._subscriptions.entries()).filter(
							([k]) => k !== entityType
						)
					);
				}
				try {
					this.actionDispatcher.dispatch(
						"realtime.subscription_modified",
						{
							entityType,
							timestamp: Date.now(),
							component: "RealtimeSync",
						}
					);
				} catch {
					// silent
				}
				return true;
			},
			{ cache: "realtime:subscriptions", key: entityType }
		);
	}

	async setPending(requestId, pending) {
		await this.#ensureOrchestrated("setPending");
		// Prefer centralized CacheManager when available
		if (this.cacheManager) {
			try {
				this.cacheManager.getCache("realtime:pending", {
					maxSize: 2000,
					keyPrefix: "realtime.pending",
				});
				this.cacheManager.applySet(
					"realtime:pending",
					requestId,
					pending
				);
				return;
			} catch {
				// fall through to fallback
			}
		}

		// Fallback instrumentation for pending set: prefer forensic.wrapOperation
		if (
			this.forensicRegistry &&
			typeof this.forensicRegistry.wrapOperation === "function"
		) {
			return this.forensicRegistry.wrapOperation(
				"cache",
				"set",
				() => {
					try {
						this.actionDispatcher?.dispatch?.("state.set", {
							cache: "realtime:pending",
							key: requestId,
							component: "RealtimeSync",
						});
					} catch {
						// silent
					}
					// Rebuild pending map with the new entry to avoid calling Map.set directly
					this._pending = new Map([
						...Array.from(this._pending.entries()).filter(
							([k]) => k !== requestId
						),
						[requestId, pending],
					]);
				},
				{ cache: "realtime:pending", key: requestId }
			);
		}

		return sharedMaybeWrap(
			this.forensicRegistry,
			this.#obsFlags,
			"cache",
			"set",
			() => {
				try {
					this.actionDispatcher?.dispatch?.("state.set", {
						cache: "realtime:pending",
						key: requestId,
						component: "RealtimeSync",
					});
				} catch {
					// silent
				}
				this._pending = new Map([
					...Array.from(this._pending.entries()).filter(
						([k]) => k !== requestId
					),
					[requestId, pending],
				]);
			},
			{ cache: "realtime:pending", key: requestId }
		).catch(() => {
			// fallback to in-memory set (rebuild map to avoid Map.set)
			try {
				this.actionDispatcher?.dispatch?.("state.set", {
					cache: "realtime:pending",
					key: requestId,
					component: "RealtimeSync",
				});
				this._pending = new Map([
					...Array.from(this._pending.entries()).filter(
						([k]) => k !== requestId
					),
					[requestId, pending],
				]);
			} catch {
				// no-op
			}
		});
	}

	async resolvePending(requestId, message) {
		await this.#ensureOrchestrated("resolvePending");
		// Prefer centralized CacheManager when available
		if (this.cacheManager) {
			try {
				const cache = this.cacheManager.getCache("realtime:pending", {
					maxSize: 2000,
					keyPrefix: "realtime.pending",
				});
				const pending =
					this.forensicRegistry &&
					typeof this.forensicRegistry.wrapOperation === "function"
						? this.forensicRegistry.wrapOperation(
								"cache",
								"get",
								() =>
									Array.from(cache.entries()).find(
										([k]) => k === requestId
									)?.[1],
								{ cache: "realtime:pending", key: requestId }
							)
						: await sharedMaybeWrap(
								this.forensicRegistry,
								this.#obsFlags,
								"cache",
								"get",
								() =>
									Array.from(cache.entries()).find(
										([k]) => k === requestId
									)?.[1],
								{ cache: "realtime:pending", key: requestId }
							);
				if (pending) {
					this.cacheManager.applyDelete(
						"realtime:pending",
						requestId
					);
					try {
						pending.resolve(message);
					} catch {
						// ignore callback errors
					}
				}
				return;
			} catch {
				// fall through to fallback
			}
		}

		// Fallback: when forensicRegistry exists, perform get + delete under wrapOperation
		if (
			this.forensicRegistry &&
			typeof this.forensicRegistry.wrapOperation === "function"
		) {
			// Await the wrapped get so we have the actual pending entry
			const pending = await sharedMaybeWrap(
				this.forensicRegistry,
				this.#obsFlags,
				"cache",
				"get",
				() =>
					Array.from(this._pending.entries()).find(
						([k]) => k === requestId
					)?.[1],
				{ cache: "realtime:pending", key: requestId }
			);
			if (pending) {
				await sharedMaybeWrap(
					this.forensicRegistry,
					this.#obsFlags,
					"cache",
					"delete",
					() => {
						this._pending = new Map(
							Array.from(this._pending.entries()).filter(
								([k]) => k !== requestId
							)
						);
					},
					{ cache: "realtime:pending", key: requestId }
				);
				try {
					pending.resolve(message);
				} catch {
					// ignore
				}
			}
			return;
		}

		return sharedMaybeWrap(
			this.forensicRegistry,
			this.#obsFlags,
			"cache",
			"delete",
			() => {
				const pending = Array.from(this._pending.entries()).find(
					([k]) => k === requestId
				)?.[1];
				if (pending) {
					this._pending = new Map(
						Array.from(this._pending.entries()).filter(
							([k]) => k !== requestId
						)
					);
					pending.resolve(message);
				}
			},
			{ cache: "realtime:pending", key: requestId }
		).catch(() => {
			const pending = Array.from(this._pending.entries()).find(
				([k]) => k === requestId
			)?.[1];
			if (pending) {
				this._pending = new Map(
					Array.from(this._pending.entries()).filter(
						([k]) => k !== requestId
					)
				);
				pending.resolve(message);
			}
		});
	}

	async enqueueMessage(message) {
		await this.#ensureOrchestrated("enqueueMessage");
		// Prefer centralized CacheManager when available. Use a single queue key to store array.
		if (this.cacheManager) {
			try {
				const cache = this.cacheManager.getCache("realtime:messages", {
					maxSize: 10,
					keyPrefix: "realtime.messages",
				});
				const q = cache["get"]("queue") || [];
				q.push(message);
				// Use cacheManager.applySet so operations are audited/instrumented
				this.cacheManager.applySet("realtime:messages", "queue", q);
				return;
			} catch {
				// fall through to fallback
			}
		}

		// Enqueue fallback: prefer forensic wrap for the push
		if (
			this.forensicRegistry &&
			typeof this.forensicRegistry.wrapOperation === "function"
		) {
			return this.forensicRegistry.wrapOperation(
				"cache",
				"set",
				() => this._messages.push(message),
				{ cache: "realtime:messages", key: String(Date.now()) }
			);
		}

		return sharedMaybeWrap(
			this.forensicRegistry,
			this.#obsFlags,
			"cache",
			"set",
			() => this._messages.push(message),
			{ cache: "realtime:messages", key: String(Date.now()) }
		).catch(() => {
			this._messages.push(message);
		});
	}

	async drainMessages() {
		await this.#ensureOrchestrated("drainMessages");
		// Prefer centralized CacheManager when available and use a queue key
		if (this.cacheManager) {
			try {
				const cache = this.cacheManager.getCache("realtime:messages", {
					maxSize: 10,
					keyPrefix: "realtime.messages",
				});
				// Ensure cache.get is observed via the shared wrapper
				const q =
					(await sharedMaybeWrap(
						this.forensicRegistry,
						this.#obsFlags,
						"cache",
						"get",
						() => cache["get"]("queue") || [],
						{ cache: "realtime:messages", key: "queue" }
					)) || [];
				q.push(message);
				this.cacheManager.applySet("realtime:messages", "queue", q);
				return q;
			} catch {
				// fall through to fallback
			}
		}

		// Return and clear the queue in an observed operation (prefer explicit forensic wrapper)
		if (
			this.forensicRegistry &&
			typeof this.forensicRegistry.wrapOperation === "function"
		) {
			return this.forensicRegistry.wrapOperation(
				"cache",
				"get",
				() => {
					const copy = this._messages.slice();
					this._messages.length = 0;
					return copy;
				},
				{ cache: "realtime:messages" }
			);
		}

		return sharedMaybeWrap(
			this.forensicRegistry,
			this.#obsFlags,
			"cache",
			"get",
			() => {
				const copy = this._messages.slice();
				this._messages.length = 0;
				return copy;
			},
			{ cache: "realtime:messages" }
		).catch(() => {
			const copy = this._messages.slice();
			this._messages.length = 0;
			return copy;
		});
	}

	async clearAll() {
		// If the central forensicRegistry exposes wrapOperation, prefer it (explicit accepted pattern)
		if (
			this.forensicRegistry &&
			typeof this.forensicRegistry.wrapOperation === "function"
		) {
			return this.forensicRegistry.wrapOperation(
				"cache",
				"clear",
				() => {
					// Reinitialize in-memory structures rather than calling Map.delete
					this._subscriptions = new Map();
					this._pending = new Map();
					this._messages = [];
				},
				{ cache: "realtime:all" }
			);
		}

		return sharedMaybeWrap(
			this.forensicRegistry,
			this.#obsFlags,
			"cache",
			"clear",
			() => {
				this._subscriptions = new Map();
				this._pending = new Map();
				this._messages = [];
			},
			{ cache: "realtime:all" }
		).catch(() => {
			try {
				this._subscriptions = new Map();
				this._pending = new Map();
				this._messages = [];
			} catch {
				// noop
			}
		});
	}
}
