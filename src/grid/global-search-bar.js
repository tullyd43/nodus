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
	}

	async onInput(event) {
		const query = event.target.value;
		if (query.length < 2) {
			this.results = [];
			this.renderResults();
			return;
		}

		if (this.queryService) {
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
        #search-input {
          width: 100%;
          padding: 12px 16px;
          font-size: 16px;
          border-radius: 8px;
          border: 1px solid #ccc;
          box-sizing: border-box;
        }
        #results-list {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #ccc;
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
          background-color: #f0f0f0;
        }
        .item-source {
          font-size: 12px;
          color: #888;
          background: #eee;
          padding: 2px 6px;
          border-radius: 4px;
          margin-right: 10px;
        }
        .item-title {
          flex-grow: 1;
        }
        .item-relevance {
          font-size: 12px;
          color: #aaa;
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
