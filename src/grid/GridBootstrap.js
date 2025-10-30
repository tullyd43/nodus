import "./GridBootstrap.css";

export default class GridBootstrap {
	constructor(container, db) {
		this.container = container;
		this.db = db;
	}

	async render() {
		const wrapper = document.createElement("div");
		wrapper.className = "grid-container";

		// Load data from IndexedDB
		const objects = await this.db
			.getObjectsByClassification("internal")
			.catch(() => []);
		const restricted = await this.db
			.getObjectsByClassification("restricted")
			.catch(() => []);
		const all = [...objects, ...restricted];

		if (all.length === 0) {
			wrapper.innerHTML = `<div class="empty">No data found in IndexedDB.</div>`;
		} else {
			all.forEach((obj) => {
				const card = document.createElement("div");
				card.className = "grid-card";
				card.tabIndex = 0;
				card.innerHTML = `
          <div class="grid-header">
            <h3>${obj.display_name}</h3>
            <span class="classification">${obj.classification}</span>
          </div>
          <div class="grid-content">
            <pre>${JSON.stringify(obj.content, null, 2)}</pre>
          </div>
        `;
				wrapper.appendChild(card);
			});
		}

		this.container.innerHTML = "";
		this.container.appendChild(wrapper);
	}
}
