export class CrossDomainSolution {
	constructor({ emit }) {
		this.emit = emit;
	}
	async requestDowngrade({ dataId, fromLevel, toLevel, justification }) {
		this.emit?.("cdsEvent", {
			type: "request_downgrade",
			dataId,
			fromLevel,
			toLevel,
			justification,
			ts: Date.now(),
		});
		return { ticketId: crypto.randomUUID(), status: "pending" };
	}
	async requestUpgrade({ dataId, fromLevel, toLevel, source }) {
		this.emit?.("cdsEvent", {
			type: "request_upgrade",
			dataId,
			fromLevel,
			toLevel,
			source,
			ts: Date.now(),
		});
		return { ticketId: crypto.randomUUID(), status: "pending" };
	}
}
