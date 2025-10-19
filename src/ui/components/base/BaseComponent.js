class BaseComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.state = {};
    this.subscriptions = new Set();
  }
  
  connectedCallback() {
    this.render();
    this.bindEvents();
  }
  
  disconnectedCallback() {
    this.cleanup();
  }
  
  // State management
  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.render();
  }
  
  // Event binding
  bindEvents() {
    // Override in subclasses
  }
  
  // Cleanup
  cleanup() {
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions.clear();
  }
  
  // Rendering
  render() {
    this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      ${this.getTemplate()}
    `;
  }
  
  getStyles() {
    return ''; // Override in subclasses
  }
  
  getTemplate() {
    return ''; // Override in subclasses
  }
  
  // ViewModel integration
  connectToViewModel(viewModel) {
    const unsubscribe = viewModel.subscribe((change) => {
      this.onViewModelChange(change);
    });
    this.subscriptions.add(unsubscribe);
  }
  
  onViewModelChange(change) {
    // Override in subclasses
  }
}

window.BaseComponent = BaseComponent;
