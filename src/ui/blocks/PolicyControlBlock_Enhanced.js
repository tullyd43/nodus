// ui/blocks/PolicyControlBlock.js
// Enhanced with permission/domain restriction tooltips

/**
 * @class PolicyControlBlock_V2
 * @description A class-based BuildingBlock that renders a UI for managing system policies.
 * It provides detailed feedback on user permissions based on their role and allowed domains,
 * showing which policies are readable or editable. This class adheres to all V8 Parity Mandates.
 * @privateFields {#context, #config, #theme, #container, #userRole, #allowedDomains, #canEditGlobal, #accessControl, #policyManager, #eventFlow}
 */
class PolicyControlBlock_V2 {
	#context;
	#config;
	#theme;
	#container;
	#userRole;
	#allowedDomains;
	#canEditGlobal;
	#accessControl;
	#policyManager;
	#eventFlow;

	/**
	 * @constructor
	 * @param {object} params - The parameters for rendering the block.
	 * @param {import('../../core/RenderContext.js').RenderContext} params.context - The rendering context.
	 * @param {object} [params.config={}] - Configuration options for the block.
	 */
	constructor({ context, config = {} }) {
		this.#context = context;
		this.#config = config;

		// Mandate 1.1 & 1.2: Get services from the context, not direct imports
		this.#theme = this.#context.getThemeVariables();
		this.#accessControl = this.#context.accessControl;
		this.#policyManager = this.#context.policyManager;
		this.#eventFlow = this.#context.eventFlow;

		// Get current user session and permissions via the AccessControl manager
		const session = this.#accessControl.getSession() || {};
		this.#userRole = session.role || "guest";
		this.#allowedDomains = this.#accessControl.getAllowedDomainsForRole(
			this.#userRole
		);
		this.#canEditGlobal =
			this.#accessControl.checkPermission("manage_policies");

		this.#container = document.createElement("div");
		this.#container.className = "policy-control-block";

		this.#applyStyling();
		this.#buildDOM();
	}

	/**
	 * Applies CSS styling to the main container element.
	 * @private
	 */
	#applyStyling() {
		this.#container.style.cssText = `
            padding: ${this.#config.padding || "1rem"};
            border-radius: ${this.#config.borderRadius || "8px"};
            background: ${this.#config.background || this.#theme["--surface"]};
            color: ${this.#config.color || this.#theme["--text"]};
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            border: 1px solid ${this.#theme["--border"]};
            min-width: ${this.#config.minWidth || "300px"};
            position: relative;
        `;
	}

	/**
	 * Builds the entire DOM structure for the block.
	 * @private
	 */
	#buildDOM() {
		// Clear any existing content
		this.#container.innerHTML = "";

		// Create header
		this.#container.appendChild(this.#createHeader());

		// Create permission status with enhanced feedback
		this.#container.appendChild(this.#createPermissionStatus());

		// Create policy sections
		const policies = this.#policyManager.getAllPolicies() || {};
		this.#container.appendChild(this.#createPolicyContainer(policies));

		// Create action buttons
		if (this.#canEditGlobal) {
			this.#container.appendChild(this.#createActionButtons());
		}
	}

	/**
	 * Creates the header for the policy control block.
	 * @private
	 * @returns {HTMLElement} The header element.
	 */
	#createHeader() {
		const headerDiv = document.createElement("div");
		headerDiv.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        `;

		const title = document.createElement("h3");
		title.textContent = this.#config.title || "System Policy Control";
		title.style.cssText = `
            margin: 0;
            color: ${this.#theme["--text"]};
            font-size: 1.1rem;
            font-weight: 600;
        `;

		const roleIndicator = document.createElement("span");
		roleIndicator.textContent = this.#userRole.toUpperCase();
		roleIndicator.style.cssText = `
            padding: 0.25rem 0.5rem;
            background: ${this.#getRoleColor(this.#userRole)};
            color: white;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: bold;
            text-transform: uppercase;
            cursor: help;
        `;

		this.#addTooltip(
			roleIndicator,
			this.#getRoleDescription(this.#userRole)
		);

		headerDiv.appendChild(title);
		headerDiv.appendChild(roleIndicator);
		return headerDiv;
	}

	/**
	 * Creates a status section that displays the user's access level and allowed policy domains.
	 * @private
	 * @returns {HTMLElement} The permission status element.
	 */
	#createPermissionStatus() {
		const statusDiv = document.createElement("div");
		statusDiv.style.cssText = `
            padding: 0.5rem;
            background: ${this.#theme["--surface-elevated"]};
            border-radius: 4px;
            border: 1px solid ${this.#theme["--border"]};
            font-size: 0.85rem;
        `;

		const accessLevel = this.#canEditGlobal ? "Full Control" : "Read Only";
		const accessColor = this.#canEditGlobal
			? this.#theme["--success"]
			: this.#theme["--warning"];
		const domainList =
			this.#allowedDomains.length > 0
				? this.#allowedDomains.join(", ")
				: "None";

		const accessInfo = document.createElement("div");
		accessInfo.style.color = this.#theme["--text-muted"];

		// Mandate 2.1: Avoid innerHTML
		const accessLevelDiv = document.createElement("div");
		accessLevelDiv.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;`;
		const accessLevelLabel = document.createElement("strong");
		accessLevelLabel.textContent = "Access Level:";
		const accessLevelValue = document.createElement("span");
		accessLevelValue.style.cssText = `color: ${accessColor}; font-weight: bold;`;
		accessLevelValue.textContent = accessLevel;
		accessLevelDiv.appendChild(accessLevelLabel);
		accessLevelDiv.appendChild(accessLevelValue);

		const allowedDomainsDiv = document.createElement("div");
		allowedDomainsDiv.style.cssText = `display: flex; justify-content: space-between; align-items: center;`;
		const allowedDomainsLabel = document.createElement("strong");
		allowedDomainsLabel.textContent = "Allowed Domains:";
		const allowedDomainsValue = document.createElement("span");
		allowedDomainsValue.style.color = this.#theme["--text-muted"];
		allowedDomainsValue.textContent = domainList;
		allowedDomainsDiv.appendChild(allowedDomainsLabel);
		allowedDomainsDiv.appendChild(allowedDomainsValue);

		accessInfo.appendChild(accessLevelDiv);
		accessInfo.appendChild(allowedDomainsDiv);

		statusDiv.appendChild(accessInfo);

		// Add help text for restricted access
		if (!this.#canEditGlobal || this.#allowedDomains.length < 5) {
			const helpText = document.createElement("div");
			helpText.style.cssText = `
                margin-top: 0.5rem;
                padding: 0.25rem;
                background: ${this.#theme["--warning"]}20;
                border-left: 3px solid ${this.#theme["--warning"]};
                font-size: 0.8rem;
                color: ${this.#theme["--text-muted"]};
            `;

			let helpMessage = "";
			if (!this.#canEditGlobal) {
				helpMessage =
					"💡 You have read-only access. Contact an administrator to modify policies.";
			} else if (this.#allowedDomains.length < 5) {
				helpMessage = `💡 You can only modify policies in: ${domainList}`;
			}

			helpText.textContent = helpMessage;
			statusDiv.appendChild(helpText);
		}

		return statusDiv;
	}

	/**
	 * Creates the main container that holds all the policy sections.
	 * @private
	 * @param {object} policies - The policies object from the PolicyManager.
	 * @returns {HTMLElement} The container element for policy sections.
	 */
	#createPolicyContainer(policies) {
		const policyDiv = document.createElement("div");
		policyDiv.className = "policy-sections";
		policyDiv.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 1rem;
            max-height: ${this.#config.maxHeight || "400px"};
            overflow-y: auto;
        `;

		const sections = {
			system: {
				name: "System Policies",
				icon: "⚙️",
				description: "Core system behavior and optimization settings",
			},
			ui: {
				name: "UI Policies",
				icon: "🎨",
				description: "User interface behavior and appearance settings",
			},
			events: {
				name: "Event Policies",
				icon: "⚡",
				description: "Event processing and flow management settings",
			},
			user: {
				name: "User Policies",
				icon: "👤",
				description: "User data and privacy management settings",
			},
			meta: {
				name: "Meta Policies",
				icon: "📊",
				description:
					"Analytics, monitoring, and system metadata settings",
			},
		};

		Object.entries(sections).forEach(([sectionKey, sectionInfo]) => {
			const sectionPolicies = policies[sectionKey] || {};
			const sectionElement = this.#createPolicySection(
				sectionKey,
				sectionInfo,
				sectionPolicies
			);
			policyDiv.appendChild(sectionElement);
		});

		return policyDiv;
	}

	/**
	 * Creates a UI section for a specific policy domain.
	 * @private
	 * @param {string} sectionKey - The key for the policy section (e.g., 'system').
	 * @param {object} sectionInfo - Contains the name, icon, and description for the section.
	 * @param {object} sectionPolicies - The policies within this section.
	 * @returns {HTMLElement} The policy section element.
	 */
	#createPolicySection(sectionKey, sectionInfo, sectionPolicies) {
		const sectionDiv = document.createElement("div");
		sectionDiv.className = `policy-section-${sectionKey}`;

		const isDomainAllowed = this.#allowedDomains.includes(
			sectionKey.toLowerCase()
		);
		const canEditSection = this.#canEditGlobal && isDomainAllowed;

		let restrictionReason = "";
		if (!this.#canEditGlobal) {
			restrictionReason = "Insufficient permissions to manage policies";
		} else if (!isDomainAllowed) {
			restrictionReason = `Role "${this.#userRole}" cannot access "${sectionKey}" domain`;
		}

		sectionDiv.style.cssText = `
            border: 1px solid ${this.#theme["--border"]};
            border-radius: 6px;
            overflow: hidden;
            background: ${this.#theme["--surface-elevated"]};
            opacity: ${canEditSection ? "1" : "0.7"};
            transition: opacity 0.2s ease;
        `;

		const header = document.createElement("div");
		header.style.cssText = `
            padding: 0.75rem;
            background: ${this.#theme["--surface"]};
            border-bottom: 1px solid ${this.#theme["--border"]};
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: ${restrictionReason ? "help" : "default"};
        `;

		const headerTitle = document.createElement("div");
		headerTitle.style.cssText = `font-size: 0.9rem; color: ${this.#theme["--text"]};`;
		const headerTitleIcon = document.createElement("span");
		headerTitleIcon.textContent = `${sectionInfo.icon} `;
		const headerTitleText = document.createElement("strong");
		headerTitleText.textContent = sectionInfo.name;
		headerTitle.appendChild(headerTitleIcon);
		headerTitle.appendChild(headerTitleText);

		const accessBadge = document.createElement("span");
		accessBadge.textContent = canEditSection ? "Edit" : "Read Only";
		accessBadge.style.cssText = `
            padding: 0.25rem 0.5rem;
            background: ${canEditSection ? this.#theme["--success"] : this.#theme["--warning"]};
            color: white;
            border-radius: 3px;
            font-size: 0.7rem;
            font-weight: bold;
            cursor: help;
        `;

		if (restrictionReason) {
			this.#addTooltip(header, restrictionReason);
			this.#addTooltip(accessBadge, restrictionReason);
		} else {
			this.#addTooltip(headerTitle, sectionInfo.description);
			this.#addTooltip(
				accessBadge,
				"You can modify policies in this domain"
			);
		}

		header.appendChild(headerTitle);
		header.appendChild(accessBadge);
		sectionDiv.appendChild(header);

		const content = document.createElement("div");
		content.style.padding = "0.75rem";

		if (!isDomainAllowed && !this.#canEditGlobal) {
			content.appendChild(this.#createNoAccessMessage(restrictionReason));
		} else {
			if (Object.keys(sectionPolicies).length === 0) {
				const noPolicies = document.createElement("div");
				noPolicies.textContent =
					"No policies configured for this domain";
				noPolicies.style.cssText = `
                    color: ${this.#theme["--text-muted"]};
                    font-style: italic;
                    text-align: center;
                    padding: 1rem;
                    background: ${this.#theme["--surface"]};
                    border-radius: 4px;
                    border: 1px dashed ${this.#theme["--border"]};
                `;
				content.appendChild(noPolicies);
			} else {
				Object.entries(sectionPolicies).forEach(
					([policyKey, policyValue]) => {
						const toggle = this.#createPolicyToggle(
							sectionKey,
							policyKey,
							policyValue,
							canEditSection,
							restrictionReason
						);
						content.appendChild(toggle);
					}
				);
			}
		}

		sectionDiv.appendChild(content);
		return sectionDiv;
	}

	/**
	 * Creates a message for sections where the user has no access.
	 * @private
	 * @param {string} restrictionReason - The reason for the lack of access.
	 * @returns {HTMLElement}
	 */
	#createNoAccessMessage(restrictionReason) {
		const noAccess = document.createElement("div");
		noAccess.style.cssText = `
            text-align: center;
            padding: 1rem;
            background: ${this.#theme["--warning"]}10;
            border-radius: 4px;
            border: 1px dashed ${this.#theme["--warning"]};
        `;

		const icon = document.createElement("div");
		icon.textContent = "🔒";
		icon.style.cssText = `font-size: 2rem; margin-bottom: 0.5rem;`;

		const message = document.createElement("div");
		message.textContent = "Access Restricted";
		message.style.cssText = `font-weight: bold; color: ${this.#theme["--text"]}; margin-bottom: 0.25rem;`;

		const reason = document.createElement("div");
		reason.textContent = restrictionReason;
		reason.style.cssText = `color: ${this.#theme["--text-muted"]}; font-size: 0.85rem; font-style: italic;`;

		noAccess.appendChild(icon);
		noAccess.appendChild(message);
		noAccess.appendChild(reason);
		return noAccess;
	}

	/**
	 * Creates a single policy row with a name, description, and a toggle switch.
	 * @private
	 * @param {string} section - The policy domain.
	 * @param {string} key - The specific policy key.
	 * @param {boolean} value - The current value of the policy.
	 * @param {boolean} editable - Whether the current user can edit this policy.
	 * @param {string} restrictionReason - The reason why the policy might not be editable.
	 * @returns {HTMLLabelElement} The row element for the policy toggle.
	 */
	#createPolicyToggle(section, key, value, editable, restrictionReason) {
		const row = document.createElement("label");
		row.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
            border-bottom: 1px solid ${this.#theme["--border"]};
            cursor: ${editable ? "pointer" : "help"};
            font-size: 0.85rem;
            transition: background-color 0.2s ease;
        `;
		row.style.opacity = editable ? "1" : "0.6";

		if (editable) {
			row.addEventListener("mouseenter", () => {
				row.style.backgroundColor = this.#theme["--surface-elevated"];
			});
			row.addEventListener("mouseleave", () => {
				row.style.backgroundColor = "transparent";
			});
		}

		const nameDiv = document.createElement("div");
		nameDiv.style.cssText = `display: flex; flex-direction: column; gap: 0.25rem; flex: 1;`;

		const name = document.createElement("span");
		name.textContent = this.#formatPolicyName(key);
		name.style.cssText = `font-weight: 500; color: ${this.#theme["--text"]};`;

		const description = document.createElement("small");
		description.textContent = this.#getPolicyDescription(key);
		description.style.cssText = `color: ${this.#theme["--text-muted"]}; font-size: 0.75rem; line-height: 1.3;`;

		nameDiv.appendChild(name);
		nameDiv.appendChild(description);

		const toggleContainer = document.createElement("div");
		toggleContainer.style.cssText = `display: flex; align-items: center; gap: 0.5rem; position: relative;`;

		const toggle = document.createElement("input");
		toggle.type = "checkbox";
		toggle.checked = !!value;
		toggle.disabled = !editable;
		toggle.dataset.policy = `${section}.${key}`; // For easier selection
		toggle.style.cssText = `width: 18px; height: 18px; cursor: ${editable ? "pointer" : "not-allowed"};`;

		const statusText = document.createElement("span");
		statusText.textContent = value ? "ON" : "OFF";
		statusText.style.cssText = `
            font-size: 0.75rem;
            font-weight: bold;
            color: ${value ? this.#theme["--success"] : this.#theme["--error"]};
            min-width: 25px;
        `;

		if (!editable) {
			const restrictionIcon = document.createElement("span");
			restrictionIcon.textContent = "🔒";
			restrictionIcon.style.cssText = `font-size: 0.8rem; opacity: 0.7; cursor: help;`;
			this.#addTooltip(
				restrictionIcon,
				restrictionReason || "Policy cannot be modified"
			);
			toggleContainer.appendChild(restrictionIcon);
		}

		const dependencies = this.#policyManager.getDependencies(section, key);
		if (dependencies.length > 0) {
			const depIcon = document.createElement("span");
			depIcon.textContent = "🔗";
			depIcon.style.cssText = `font-size: 0.8rem; opacity: 0.7; cursor: help; margin-left: 0.25rem;`;
			const depText = `Depends on: ${dependencies.map((dep) => this.#formatPolicyName(dep.split(".")[1])).join(", ")}`;
			this.#addTooltip(depIcon, depText);
			toggleContainer.appendChild(depIcon);
		}

		if (editable) {
			toggle.addEventListener("change", async () => {
				await this.#handlePolicyToggle(section, key, toggle.checked);
				statusText.textContent = toggle.checked ? "ON" : "OFF";
				statusText.style.color = toggle.checked
					? this.#theme["--success"]
					: this.#theme["--error"];
			});
		} else {
			this.#addTooltip(
				toggle,
				restrictionReason ||
					"You do not have permission to modify this policy"
			);
		}

		toggleContainer.appendChild(toggle);
		toggleContainer.appendChild(statusText);

		row.appendChild(nameDiv);
		row.appendChild(toggleContainer);

		return row;
	}

	/**
	 * Attaches a tooltip to an element.
	 * @private
	 * @param {HTMLElement} element - The element to attach the tooltip to.
	 * @param {string} text - The text content of the tooltip.
	 */
	#addTooltip(element, text) {
		if (!text) return;

		element.addEventListener("mouseenter", (e) => {
			const tooltip = this.#createTooltip(text);
			document.body.appendChild(tooltip);

			const rect = element.getBoundingClientRect();
			tooltip.style.left = `${rect.left + rect.width / 2}px`;
			tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;

			const tooltipRect = tooltip.getBoundingClientRect();
			if (tooltipRect.left < 10) tooltip.style.left = "10px";
			if (tooltipRect.right > window.innerWidth - 10) {
				tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
			}

			element._tooltip = tooltip;
		});

		element.addEventListener("mouseleave", () => {
			if (element._tooltip) {
				element._tooltip.remove();
				element._tooltip = null;
			}
		});
	}

	/**
	 * Creates the DOM element for a tooltip.
	 * @private
	 * @param {string} text - The text to display in the tooltip.
	 * @returns {HTMLElement} The tooltip div element.
	 */
	#createTooltip(text) {
		const tooltip = document.createElement("div");
		tooltip.textContent = text;
		tooltip.style.cssText = `
            position: absolute;
            background: ${this.#theme["--surface-elevated"]};
            color: ${this.#theme["--text"]};
            padding: 0.5rem;
            border-radius: 4px;
            border: 1px solid ${this.#theme["--border"]};
            font-size: 0.8rem;
            max-width: 200px;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            pointer-events: none;
            transform: translateX(-50%);
        `;

		const arrow = document.createElement("div");
		arrow.style.cssText = `
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            width: 0; height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 5px solid ${this.#theme["--border"]};
        `;
		tooltip.appendChild(arrow);

		return tooltip;
	}

	/**
	 * Creates the action buttons (Refresh, Export, Import).
	 * @private
	 * @returns {HTMLElement} A div containing the action buttons.
	 */
	#createActionButtons() {
		const actionsDiv = document.createElement("div");
		actionsDiv.style.cssText = `
            display: flex;
            gap: 0.5rem;
            padding-top: 0.5rem;
            border-top: 1px solid ${this.#theme["--border"]};
            margin-top: 0.5rem;
        `;

		const refreshBtn = this.#createButton(
			"Refresh",
			"🔄",
			() => window.location.reload(),
			"Reload the page to refresh policy states"
		);
		const exportBtn = this.#createButton(
			"Export",
			"📤",
			() => this.#exportPolicies(),
			"Export current policy configuration as JSON"
		);

		actionsDiv.appendChild(refreshBtn);
		actionsDiv.appendChild(exportBtn);

		if (this.#userRole === "super_admin") {
			const importBtn = this.#createButton(
				"Import",
				"📥",
				() => this.#importPolicies(),
				"Import policy configuration from JSON file"
			);
			actionsDiv.appendChild(importBtn);
		}

		return actionsDiv;
	}

	/**
	 * A helper function to create a styled button.
	 * @private
	 * @param {string} text - The button's text label.
	 * @param {string} icon - An emoji or icon character.
	 * @param {function} onClick - The click handler.
	 * @param {string} tooltipText - The text for the button's tooltip.
	 * @returns {HTMLButtonElement}
	 */
	#createButton(text, icon, onClick, tooltipText) {
		const button = document.createElement("button");
		// Mandate 2.1: Avoid innerHTML
		button.textContent = `${icon} ${text}`;
		button.style.cssText = `
            padding: 0.5rem 1rem;
            background: ${this.#theme["--primary"]};
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.8rem;
            font-weight: 500;
            transition: background 0.2s;
        `;

		button.addEventListener("click", onClick);
		button.addEventListener("mouseenter", () => {
			button.style.background =
				this.#theme["--primary-dark"] || this.#theme["--primary"];
		});
		button.addEventListener("mouseleave", () => {
			button.style.background = this.#theme["--primary"];
		});

		if (tooltipText) {
			this.#addTooltip(button, tooltipText);
		}

		return button;
	}

	/**
	 * Handles the logic for updating a policy when its toggle is changed.
	 * @private
	 * @param {string} section - The policy domain.
	 * @param {string} key - The policy key.
	_param {boolean} enabled - The new state of the policy.
	 * @returns {Promise<void>}
	 */
	async #handlePolicyToggle(section, key, enabled) {
		try {
			// Mandate 1.1: Use the central policy manager to update
			await this.#policyManager.update(section, key, enabled);

			// Mandate 2.4: Emit a standardized event
			if (this.#eventFlow) {
				this.#eventFlow.emit("policy_updated", {
					section,
					key,
					enabled,
					role: this.#userRole,
					timestamp: new Date().toISOString(),
				});
			}

			// Mandate 2.4: Create a standardized audit log
			this.#accessControl.auditAction(`policy_update:${section}.${key}`, {
				enabled,
				domain: section,
			});

			console.log(`Policy updated: ${section}.${key} = ${enabled}`);
		} catch (error) {
			console.error(`Failed to update policy ${section}.${key}:`, error);

			// Revert UI state on error
			const toggle = this.#container.querySelector(
				`input[data-policy="${section}.${key}"]`
			);
			if (toggle) {
				toggle.checked = !enabled;
			}

			if (this.#eventFlow) {
				this.#eventFlow.emit("error", {
					message: `Failed to update policy: ${error.message}`,
					level: "medium",
					context: { section, key, enabled },
				});
			}
		}
	}

	/**
	 * Exports the current policy configuration to a JSON file.
	 * @private
	 */
	#exportPolicies() {
		const export_data = {
			timestamp: new Date().toISOString(),
			exportedBy: this.#userRole,
			policies: this.#policyManager.getAllPolicies(),
			metadata: {
				version: "1.0",
				domains: this.#allowedDomains,
			},
		};

		const blob = new Blob([JSON.stringify(export_data, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `policies-${new Date().toISOString().split("T")[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	/**
	 * Opens a file dialog to import a policy configuration from a JSON file.
	 * @private
	 */
	#importPolicies() {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = (e) => {
			const file = e.target.files[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = async (e) => {
					try {
						const imported = JSON.parse(e.target.result);
						if (imported && imported.policies) {
							await this.#policyManager.importPolicies(
								imported.policies
							);
							this.#buildDOM(); // Re-render the component with new policies
							this.#eventFlow.emit("notification", {
								message:
									"Policies imported successfully. Refreshing view.",
							});
						} else {
							throw new Error("Invalid policy file format.");
						}
					} catch (error) {
						console.error("Invalid policy file:", error);
						this.#eventFlow.emit("error", {
							message: `Failed to import policies: ${error.message}`,
						});
					}
				};
				reader.readAsText(file);
			}
		};
		input.click();
	}

	/**
	 * Gets a representative color for a given user role.
	 * @private
	 * @param {string} role
	 * @returns {string}
	 */
	#getRoleColor(role) {
		const colors = {
			super_admin: "#dc3545",
			db_admin: "#fd7e14",
			developer: "#20c997",
			analyst: "#6f42c1",
			monitor: "#6c757d",
			guest: "#adb5bd",
		};
		return colors[role] || colors.guest;
	}

	/**
	 * Gets a human-readable description for a given user role.
	 * @private
	 * @param {string} role
	 * @returns {string}
	 */
	#getRoleDescription(role) {
		const descriptions = {
			super_admin: "Full system access across all domains and operations",
			db_admin:
				"Database and system optimization access (system, ui, events)",
			developer: "Development and UI component access (ui, events)",
			analyst: "Analytics and reporting access (user, meta)",
			monitor: "Read-only monitoring access (meta)",
			guest: "No access - read-only guest user",
		};
		return descriptions[role] || "Unknown role";
	}

	/**
	 * Converts a policy key into a human-readable title.
	 * @private
	 * @param {string} key
	 * @returns {string}
	 */
	#formatPolicyName(key) {
		return key
			.replace(/_/g, " ")
			.replace(/([A-Z])/g, " $1")
			.replace(/^./, (str) => str.toUpperCase())
			.trim();
	}

	/**
	 * Retrieves a pre-defined description for a specific policy key.
	 * @private
	 * @param {string} key
	 * @returns {string}
	 */
	#getPolicyDescription(key) {
		const descriptions = {
			enable_analytics:
				"Track user interactions and system usage patterns",
			enable_auditing: "Log all system changes and access attempts",
			enable_ai_assistance: "Use AI for suggestions and automation",
			enable_optimization: "Automatic performance optimizations",
			enable_caching: "Cache frequently accessed data",
			enable_lazy_loading: "Load components on demand",
			enable_monitoring: "Real-time system monitoring",
			enable_notifications: "System and user notifications",
			enable_debug_mode: "Enhanced debugging information",
			enable_maintenance_mode: "System maintenance operations",
			enable_animations: "UI animations and transitions",
			enable_tooltips: "Help tooltips and hints",
			dark_mode_default: "Default to dark theme",
			responsive_design: "Responsive layout behavior",
			accessibility_mode: "Enhanced accessibility features",
			enable_event_flows: "Event processing and flows",
			enable_event_logging: "Log all system events",
			enable_async_processing: "Asynchronous event processing",
			enable_user_analytics: "Track user behavior",
			enable_preference_sync: "Sync user preferences",
			privacy_mode: "Enhanced privacy protection",
			enable_performance_tracking: "Track system performance",
			enable_error_reporting: "Report errors to monitoring",
			enable_health_checks: "System health monitoring",
		};
		return descriptions[key] || "Policy configuration option";
	}

	/**
	 * Returns the main DOM element for the block.
	 * @public
	 * @returns {HTMLElement}
	 */
	render() {
		return this.#container;
	}
}

/**
 * @function PolicyControlBlock
 * @description A factory function that creates and returns the DOM element for the policy control block.
 * This maintains compatibility with the original functional block signature.
 * @param {object} params - The parameters for rendering the block.
 * @param {import('../../core/RenderContext.js').RenderContext} params.context - The rendering context.
 * @param {object} [params.config={}] - Configuration options for the block.
 * @returns {HTMLElement} The rendered HTML element for the policy control panel.
 */
export function PolicyControlBlock({ context, config = {} }) {
	const block = new PolicyControlBlock_V2({ context, config });
	return block.render();
}

/**
 * @function registerPolicyControlBlock
 * @description Registers the `PolicyControlBlock` with the `BuildingBlockRenderer`,
 * making it available for use in compositions.
 * @param {import('../../core/BuildingBlockRenderer.js').BuildingBlockRenderer} renderer - The renderer instance to register with.
 * @returns {void}
 */
export function registerPolicyControlBlock(renderer) {
	renderer.registerBlock("policy_control", {
		render: PolicyControlBlock,
		config: {
			title: "System Policy Control",
			padding: "1rem",
			minWidth: "300px",
			maxHeight: "500px",
		},
		dependencies: ["accessControl", "policyManager", "eventFlow"],
	});
}

/**
 * @function createPolicyControl
 * @description A factory function to create a composition object for the `PolicyControlBlock`.
 * @param {object} [config={}] - Configuration options for the block.
 * @returns {object} A composition object representing the policy control block.
 */
export function createPolicyControl(config = {}) {
	return {
		type: "policy_control",
		config: {
			title: "Policy Management",
			...config,
		},
	};
}

export default PolicyControlBlock;
