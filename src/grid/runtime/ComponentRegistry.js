// src/grid/runtime/ComponentRegistry.js
import { EnhancedGridRenderer } from "../EnhancedGridRenderer.js";
import { normalizeConfig } from "./GridRuntimeConfig.js";
import { LayoutStore } from "./LayoutStore.js";

export class ComponentRegistry {
	#types = new Map();
	#allowed = new Set(["text", "html"]);

	setAllowedTypes(list) {
		if (Array.isArray(list)) this.#allowed = new Set(list.map(String));
	}

	register(type, { mount, unmount }) {
		if (!type || typeof mount !== "function") return;
		this.#types.set(type, { mount, unmount });
	}

	async mount(type, el, props = {}, context = {}) {
		if (!this.#allowed.has(type)) {
			el.textContent = "[blocked component]";
			return () => {
				el.textContent = "";
			};
		}
		const entry = this.#types.get(type);
		if (!entry) {
			// default: render text if missing
			el.textContent = props?.text ?? "";
			return () => {
				el.textContent = "";
			};
		}
		const ret = await entry.mount(el, props, context);
		if (typeof ret === "function") return ret;
		return () => {
			try {
				entry.unmount?.(el);
			} catch {
				/* noop */
			}
		};
	}
}

export const componentRegistry = new ComponentRegistry();

// Built-in components
componentRegistry.register("text", {
	mount(el, props) {
		el.textContent = props?.value ?? props?.text ?? "";
		return () => {
			el.textContent = "";
		};
	},
});

componentRegistry.register("html", {
	mount(el, props) {
		const html = String(props?.html ?? "");
		// Basic hardening: strip script tags and inline event handlers
		const tmp = document.createElement("div");
		tmp.innerHTML = html;
		// Remove <script> and on* attributes
		tmp.querySelectorAll("script").forEach((n) => n.remove());
		tmp.querySelectorAll("*").forEach((n) => {
			[...n.attributes].forEach((attr) => {
				const name = attr.name;
				const val = String(attr.value || "").trim();
				if (/^on/i.test(name)) {
					n.removeAttribute(name);
					return;
				}
				// Drop style attributes entirely to avoid CSS-based exfiltration
				if (name.toLowerCase() === "style") {
					n.removeAttribute(name);
					return;
				}
				// Disallow javascript: or data: URLs on href/src/xlink:href
				if (
					["href", "src", "xlink:href"].includes(name.toLowerCase())
				) {
					const lower = val.toLowerCase();
					if (
						lower.startsWith("javascript:") ||
						lower.startsWith("data:")
					) {
						n.removeAttribute(name);
					}
				}
			});
		});
		el.replaceChildren(...tmp.childNodes);
		return () => {
			el.replaceChildren();
		};
	},
});

// Simple configurable block component (dev-friendly)
componentRegistry.register("block", {
	mount(el, props = {}) {
		const title = props.title ?? "Block";
		const body = props.body ?? "Configure me";
		el.classList.add("cfg-block");
		el.innerHTML = `
      <div class="cfg-block-card" style="border:1px solid #e1e4e8;border-radius:8px;padding:12px;background:#fff;min-height:60px;">
        <div class="cfg-block-title" style="font-weight:600;margin-bottom:6px;">${title}</div>
        <div class="cfg-block-body" style="opacity:0.85">${body}</div>
      </div>
    `;
		return () => {
			el.replaceChildren();
			el.classList.remove("cfg-block");
		};
	},
});

// Reusable button element that emits grid actions
componentRegistry.register("button", {
	mount(el, props = {}, context = {}) {
		const stateManager = context.stateManager;
		const label = props.label ?? "Add";
		const mode = String(props.mode || "modal"); // 'add' | 'modal'
		const variant = String(props.variant || "primary");
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = `ui-btn ui-btn-${variant}`;
		btn.textContent = label;
		btn.style.cssText = `
      display:inline-block; border:0; border-radius:6px; padding:10px 14px;
      background:#2b7cff; color:#fff; font-weight:600; cursor:pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.12);
    `;
		const onClick = (e) => {
			try {
				stateManager?.emit?.("gridAddBlockRequested", {
					mode,
					source: "button",
					context,
				});
			} catch {
				/* This can fail if the event bus is not ready; suppress error. */
			}
		};
		btn.addEventListener("click", onClick);
		el.replaceChildren(btn);
		return () => {
			try {
				btn.removeEventListener("click", onClick);
			} catch {
				/* This can fail if the element is already removed; suppress error. */
			}
			el.replaceChildren();
		};
	},
});

// Nested grid component: mounts an independent grid runtime inside a block
componentRegistry.register("grid", {
	async mount(el, props = {}, context = {}) {
		const stateManager = context.stateManager;
		// Create nested container
		const container = document.createElement("div");
		container.className = "grid-container nested-grid-container";
		el.appendChild(container);

		// Compute nested identifiers and scope for persistence
		const parentId = String(context.parentConfigId || "default");
		const nestedKey = `${parentId}:${String(context.blockId || props.id || "grid")}`;
		const scope = (() => {
			try {
				const policies = stateManager?.managers?.policies;
				const subj =
					stateManager?.managers?.securityManager?.getSubject?.() ||
					{};
				const pref = String(
					policies?.getPolicy(
						"system",
						"grid_auto_save_layout_scope"
					) || "tenant"
				).toLowerCase();
				if (pref === "user")
					return { tenantId: subj.tenantId, userId: subj.userId };
				if (pref === "tenant")
					return { tenantId: subj.tenantId, userId: "tenant" };
				return { tenantId: "global", userId: "global" };
			} catch {
				return { tenantId: "public", userId: "anon" };
			}
		})();
		const store = new LayoutStore({ stateManager });

		// Load saved nested config if present; else fall back to provided props.config
		let rawConfig = props?.config || {};
		try {
			const savedCfg = await store.loadConfig(nestedKey, scope);
			if (savedCfg) rawConfig = savedCfg;
		} catch {
			/* noop */
		}

		// Build a local ViewModel compatible with EnhancedGridRenderer expectations
		const cfg = normalizeConfig(rawConfig);
		const blocks = cfg.blocks.map((b) => ({
			blockId: b.id,
			position: { x: b.x, y: b.y, w: b.w, h: b.h },
		}));
		const nestedVM = {
			_layout: { blocks },
			getCurrentLayout() {
				return this._layout;
			},
			updatePositions(updates) {
				const byId = new Map(
					this._layout.blocks.map((b) => [b.blockId, b])
				);
				for (const u of updates || []) {
					const rec = byId.get(u.blockId);
					if (rec) {
						rec.position.x = u.x;
						rec.position.y = u.y;
						rec.position.w = u.w;
						rec.position.h = u.h;
					}
				}
				// reflect back into blocks array (preserve order)
				this._layout.blocks = this._layout.blocks.map(
					(b) => byId.get(b.blockId) || b
				);
			},
		};

		// Instantiate a dedicated renderer for the nested grid
		const enhancer = new EnhancedGridRenderer(stateManager);

		// Initialize with onLayoutChange hook for nested autosave
		await enhancer.initialize({
			container,
			appViewModel: { gridLayoutViewModel: nestedVM },
			options: {
				onLayoutChange: async () => {
					try {
						const layout = enhancer.getCurrentLayout?.();
						if (layout) await store.save(nestedKey, layout, scope);
					} catch {
						/* noop */
					}
				},
			},
		});

		// Create block DOMs and mount inner components
		for (const b of cfg.blocks) {
			const block = document.createElement("div");
			block.className = "grid-block";
			block.dataset.blockId = b.id;
			block.dataset.minW = String(b.constraints.minW);
			block.dataset.minH = String(b.constraints.minH);
			block.dataset.maxW = String(b.constraints.maxW);
			block.dataset.maxH = String(b.constraints.maxH);
			const content = document.createElement("div");
			content.className = "grid-block-content";
			block.appendChild(content);
			container.appendChild(block);
			try {
				await componentRegistry.mount(b.type, content, b.props || {}, {
					...context,
					parentConfigId: nestedKey,
				});
			} catch {
				/* noop */
			}
		}

		// Persist effective nested config
		try {
			await store.saveConfig(nestedKey, cfg, scope);
		} catch {
			/* noop */
		}

		// Attempt to load any saved nested layout and apply positions
		try {
			const saved = await store.load(nestedKey, scope);
			if (saved?.blocks && Array.isArray(saved.blocks)) {
				for (const b of saved.blocks) {
					const p = {
						blockId: b.blockId,
						x: b.position?.x ?? b.x,
						y: b.position?.y ?? b.y,
						w: b.position?.w ?? b.w,
						h: b.position?.h ?? b.h,
					};
					enhancer.updateBlockPosition?.(
						p.blockId,
						p.x,
						p.y,
						p.w,
						p.h
					);
				}
			}
		} catch {
			/* noop */
		}

		// Return cleanup
		return () => {
			try {
				enhancer.destroy?.();
			} catch {
				/* noop */
			}
			el.replaceChildren();
		};
	},
});
