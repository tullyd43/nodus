export class InformationFlowTracker {
	constructor(emit) {
		this.emit = emit;
	}
	derived(fromLabels = [], derivedLabel, meta = {}) {
		this.emit?.("infoFlow", {
			fromLabels,
			derivedLabel,
			...meta,
			ts: Date.now(),
		});
	}
}
