/**
 * @file global-search-bar.js
 * @description A web component for a global search and command bar.
 * It interacts with the QueryService to provide real-time search results and suggestions.
 */

/* global customElements */

class GlobalSearchBar extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this.stateManager = window.stateManager; // Align with global state contract
		this.queryService = null;
		this.results = [];
		this.selectedIndex = -1;
	}

	connectedCallback() {
		this.render();
		this.inputElement = this.shadowRoot.querySelector("#search-input");
		this.resultsElement = this.shadowRoot.querySelector("#results-list");

		this.inputElement.addEventListener(
			"input",
			this.debounce(this.onInput.bind(this), 200)
		);
		this.inputElement.addEventListener(
			"keydown",
			this.onKeyDown.bind(this)
		);
		document.addEventListener("click", this.onDocumentClick.bind(this));
	}

	setQueryService(service) {
		this.queryService = service;
		// In a fully aligned system, this would be replaced by:
		// this.queryService = this.stateManager.managers.queryService;
		// This method is kept for backward compatibility during transition.
		console.warn(
			"[GlobalSearchBar] Direct query service injection is deprecated. Use stateManager."
		);
	}

	async onInput(event) {
		const query = event.target.value;
		if (query.length < 2) {
			this.results = [];
			this.renderResults();
			return;
		}

		// Align with V8.0 plan: use the state manager's query service if available
		const queryService =
			this.stateManager?.managers?.queryService || this.queryService;

		if (queryService) {
			this.results = await this.queryService.search(query, { limit: 10 });
			this.selectedIndex = -1;
			this.renderResults();
		}
	}

	onKeyDown(event) {
		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();
				this.selectedIndex = Math.min(
					this.selectedIndex + 1,
					this.results.length - 1
				);
				this.updateSelection();
				break;
			case "ArrowUp":
				event.preventDefault();
				this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
				this.updateSelection();
				break;
			case "Enter":
				if (this.selectedIndex > -1) {
					this.selectItem(this.results[this.selectedIndex]);
				}
				break;
			case "Escape":
				this.results = [];
				this.renderResults();
				break;
		}
	}

	onDocumentClick(event) {
		if (!this.contains(event.target)) {
			this.results = [];
			this.renderResults();
		}
	}

	selectItem(item) {
		console.log("Selected:", item);
		this.dispatchEvent(new CustomEvent("item-selected", { detail: item }));
		this.inputElement.value = "";
		this.results = [];
		this.renderResults();
	}

	updateSelection() {
		this.shadowRoot.querySelectorAll("li").forEach((li, index) => {
			li.classList.toggle("selected", index === this.selectedIndex);
		});
	}

	renderResults() {
		if (this.results.length === 0) {
			this.resultsElement.style.display = "none";
			return;
		}

		this.resultsElement.style.display = "block";
		this.resultsElement.innerHTML = this.results
			.map(
				(item) => `
      <li data-id="${item.id}">
        <span class="item-source">${item.source}</span>
        <span class="item-title">${item.title || item.name}</span>
        <span class="item-relevance">${(item.relevance || 0).toFixed(2)}</span>
      </li>
    `
			)
			.join("");

		this.shadowRoot.querySelectorAll("li").forEach((li) => {
			li.addEventListener("click", () => {
				const selectedItem = this.results.find(
					(r) => r.id === li.dataset.id
				);
				if (selectedItem) {
					this.selectItem(selectedItem);
				}
			});
		});
	}

	debounce(func, delay) {
		let timeout;
		return function (...args) {
			clearTimeout(timeout);
			timeout = setTimeout(() => func.apply(this, args), delay);
		};
	}

	render() {
		this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: relative;
          display: block;
          width: 100%;
          max-width: 600px;
          margin: 0 auto;
        }
        /* Use global CSS variables for theme alignment */
        #search-input {
          width: 100%;
          padding: 12px 16px;
          font-size: 16px;
          border-radius: var(--border-radius, 8px);
          border: 1px solid var(--border, #404040);
          background-color: var(--surface-elevated, #2d2d2d);
          color: var(--text, #f5f5f5);
          box-sizing: border-box;
        }
        #search-input::placeholder {
          color: var(--text-muted, #b0b0b0);
        }
        #results-list {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--surface-elevated, #2d2d2d);
          color: var(--text, #f5f5f5);
          border: 1px solid var(--border, #404040);
          border-top: none;
          border-radius: 0 0 8px 8px;
          list-style: none;
          padding: 0;
          margin: 0;
          max-height: 400px;
          overflow-y: auto;
          z-index: 1000;
          display: none;
        }
        li {
          padding: 10px 16px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        li:hover, li.selected {
          background-color: var(--primary, #007acc);
          color: white;
        }
        .item-source {
          font-size: 12px;
          color: var(--text-muted, #b0b0b0);
          background: var(--surface, #1e1e1e);
          padding: 2px 6px;
          border-radius: var(--border-radius, 6px);
          margin-right: 10px;
        }
        .item-title {
          flex-grow: 1;
        }
        .item-relevance {
          font-size: 12px;          
        }
      </style>
      <div id="search-container">
        <input type="text" id="search-input" placeholder="Search or type a command...">
        <ul id="results-list"></ul>
      </div>
    `;
	}
}

customElements.define("global-search-bar", GlobalSearchBar);

export default GlobalSearchBar;
