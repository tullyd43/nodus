/**
 * @file ForensicPlugin.js
 * @description Forensic envelope instrumentation for AsyncOrchestrator.
 */

const ENVELOPE_SLOT = Symbol("async.forensic.envelope");

/**
 * @typedef {import("../AsyncOrchestrator.js").AsyncRunContext} AsyncRunContext
 */

/**
 * @class ForensicPlugin
 * @classdesc Wraps orchestrated runs in forensic envelopes for auditability.
 */
export class ForensicPlugin {
	/**
	 * @param {{ forensicLogger?: { createEnvelope?:(type:string, payload:any, context?:any)=>Promise<any>|any, commitEnvelope?:(envelope:any)=>Promise<any>|any } }} [options]
	 */
	constructor(options = {}) {
		this.name = "forensic";
		this.priority = 40;
		this.#logger = options.forensicLogger || null;
	}

	/**
	 * @param {AsyncRunContext} context
	 * @returns {boolean}
	 */
	supports(context) {
		const logger =
			this.#logger ||
			context.options?.forensicLogger ||
			context.options?.stateManager?.forensicLogger ||
			context.options?.stateManager?.managers?.forensicLogger;
		return !!(logger?.createEnvelope && logger?.commitEnvelope);
	}

	/**
	 * Creates a forensic envelope before execution.
	 * @param {AsyncRunContext} context
	 * @returns {void}
	 */
	before(context) {
		const forensicLogger =
			this.#logger ||
			context.options?.forensicLogger ||
			context.options?.stateManager?.forensicLogger ||
			context.options?.stateManager?.managers?.forensicLogger;
		if (!forensicLogger?.createEnvelope || !forensicLogger.commitEnvelope) {
			return;
		}

		// Policy gate: consult shared policy adapter (fast sync path) before creating envelopes.
		try {
			const stateManager =
				context.options?.stateManager ||
				context.orchestrator?._stateManager ||
				null;
			const adapter = stateManager?.managers?.policyAdapter;
			if (adapter?.shouldInstrumentSync) {
				let allowed = true;
				try {
					allowed = Boolean(
						adapter.shouldInstrumentSync({
							component: "async",
							operation: "forensic",
							classification:
								context.classification?.level || "internal",
							tenantId: context.tenantId,
							data: context.meta,
						})
					);
				} catch {
					allowed = true; // fail-open on adapter error
				}
				if (!allowed) return; // policy denied forensic envelopes
			}
		} catch (policyErr) {
			// fail-open: log via console to avoid requiring a logger
			console.warn(
				"[ForensicPlugin] Policy check failed, proceeding with forensic envelope",
				policyErr
			);
		}

		const payload = {
			label: context.label,
			meta: context.meta,
			tenantId: context.tenantId,
			actorId: context.actorId,
			startedAt: new Date().toISOString(),
			classification: {
				level: context.classification.level,
				compartments: Array.from(context.classification.compartments),
			},
			status: "pending",
		};

		try {
			const envelopeTask = forensicLogger.createEnvelope(
				context.eventType,
				payload,
				{ actorId: context.actorId, tenantId: context.tenantId }
			);
			context.attach(ENVELOPE_SLOT, {
				logger: forensicLogger,
				envelopeTask,
				payload,
			});
		} catch {
			// Envelope creation best-effort.
		}
	}

	/**
	 * Annotates success outcome.
	 * @param {AsyncRunContext} context
	 * @returns {void}
	 */
	after(context) {
		const slot = context.getAttachment(ENVELOPE_SLOT);
		if (!slot) return;
		slot.payload.status = "success";
		slot.payload.completedAt = new Date().toISOString();
		slot.payload.durationMs = context.durationMs;
	}

	/**
	 * Annotates failure outcome.
	 * @param {AsyncRunContext} context
	 * @returns {void}
	 */
	error(context) {
		const slot = context.getAttachment(ENVELOPE_SLOT);
		if (!slot) return;
		slot.payload.status = "error";
		slot.payload.completedAt = new Date().toISOString();
		slot.payload.durationMs = context.durationMs;
		if (context.error) {
			slot.payload.error = {
				name: context.error.name,
				message: context.error.message,
			};
		}
	}

	/**
	 * Marks skipped runs.
	 * @param {AsyncRunContext} context
	 * @returns {void}
	 */
	skip(context) {
		const slot = context.getAttachment(ENVELOPE_SLOT);
		if (!slot) return;
		slot.payload.status = "skipped";
		slot.payload.completedAt = new Date().toISOString();
		slot.payload.durationMs = context.durationMs;
	}

	/**
	 * Commits the forensic envelope.
	 * @param {AsyncRunContext} context
	 * @returns {Promise<void>}
	 */
	async settled(context) {
		const slot = context.getAttachment(ENVELOPE_SLOT);
		if (!slot) return;
		context.deleteAttachment(ENVELOPE_SLOT);

		const { logger, envelopeTask, payload } = slot;
		if (!logger?.commitEnvelope || !envelopeTask) return;
		try {
			const envelope = await envelopeTask;
			if (envelope && envelope.payload) {
				Object.assign(envelope.payload, payload);
			}
			await logger.commitEnvelope(envelope);
		} catch {
			// Commit best-effort.
		}
	}

	#logger;
}

export default ForensicPlugin;
