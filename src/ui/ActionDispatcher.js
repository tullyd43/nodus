// src/core/ui/ActionDispatcher.js
export class ActionDispatcher {
	constructor({ hybridStateManager }) {
		this.hybridStateManager = hybridStateManager;
		this.audit = hybridStateManager.forensicLogger;
		this.mac = hybridStateManager.mac;
	}

	attach(root = document) {
		root.addEventListener("click", (e) => this._handle(e));
	}

	async _handle(e) {
		const el = e.target.closest("[data-action]");
		if (!el) return;
		const action = el.dataset.action;
		const entityId = el.dataset.entity;

		try {
			const entity = await this.hybridStateManager.getEntity(entityId);
			const label = this.mac.label(entity);

			switch (action) {
				case "save":
					this.mac.enforceNoWriteDown(this.mac.subject(), label);
					await this.hybridStateManager.saveEntity(entity);
					break;

				case "delete":
					this.mac.enforceNoWriteDown(this.mac.subject(), label);
					await this.hybridStateManager.deleteEntity(entityId);
					break;

				default:
					console.warn(
						`[ActionDispatcher] Unknown action: ${action}`
					);
			}

			await this.audit.signAction({
				userId: this.hybridStateManager.currentUserId,
				action,
				label,
			});
		} catch (err) {
			console.error(`[ActionDispatcher] ${action} failed:`, err);
		}
	}
}
