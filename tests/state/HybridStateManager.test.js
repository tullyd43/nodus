import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridStateManager } from '@platform/state/HybridStateManager.js';

// Mock ServiceRegistry and its dependencies
vi.mock('@platform/bootstrap/ServiceRegistry.js', () => {
    const mockServiceRegistry = {
        get: vi.fn(),
        initializeAll: vi.fn(),
    };
    return {
        ServiceRegistry: vi.fn(() => mockServiceRegistry),
    };
});

// Mock DateCore
vi.mock('@shared/lib/DateUtils.js', () => ({
    DateCore: {
        timestamp: vi.fn(() => '2025-11-04T12:00:00.000Z'),
    },
}));

describe('HybridStateManager', () => {
    let stateManager;
    let mockAsyncOrchestrator;

    beforeEach(() => {
        vi.clearAllMocks();

        // Re-import the mocked ServiceRegistry to get the latest mock instance
        const { ServiceRegistry } = require('@platform/bootstrap/ServiceRegistry.js');
        const serviceRegistryInstance = new ServiceRegistry();

        mockAsyncOrchestrator = {
            run: vi.fn((operation) => operation()), // Immediately execute the operation
        };

        // Setup the mock `get` method to return the orchestrator when requested
        serviceRegistryInstance.get.mockImplementation(async (serviceName) => {
            if (serviceName === 'asyncOrchestrator') {
                return mockAsyncOrchestrator;
            }
            return null;
        });

        stateManager = new HybridStateManager();
        // Manually assign the mocked managers object for testing purposes
        stateManager.managers.asyncOrchestrator = mockAsyncOrchestrator;
        stateManager.managers.actionDispatcher = { dispatch: vi.fn() };
    });

    it('should instantiate without errors', () => {
        expect(stateManager).toBeInstanceOf(HybridStateManager);
        expect(stateManager.isInitialized).toBe(false);
    });

    it('should initialize services through the ServiceRegistry', async () => {
        const { ServiceRegistry } = require('@platform/bootstrap/ServiceRegistry.js');
        const serviceRegistryInstance = new ServiceRegistry();

        await stateManager.initialize();

        expect(serviceRegistryInstance.get).toHaveBeenCalledWith('asyncOrchestrator');
        expect(serviceRegistryInstance.initializeAll).toHaveBeenCalled();
        expect(stateManager.isInitialized).toBe(true);
    });

    it('should emit an event and notify listeners', async () => {
        const listener = vi.fn();
        const eventName = 'test.event';
        const payload = { data: 'test' };

        stateManager.on(eventName, listener);
        stateManager.emit(eventName, payload);

        // Since emit is orchestrated, we need to wait for the run block to execute
        await new Promise(process.nextTick); // Wait for the next tick

        expect(listener).toHaveBeenCalledWith(payload);
        expect(mockAsyncOrchestrator.run).toHaveBeenCalled();
    });

    it('should handle event listener errors gracefully', async () => {
        const faultyListener = vi.fn(() => { throw new Error('Listener Error'); });
        const eventName = 'faulty.event';

        stateManager.on(eventName, faultyListener);
        stateManager.emit(eventName, {});

        await new Promise(process.nextTick);

        expect(faultyListener).toHaveBeenCalled();
        expect(stateManager.managers.actionDispatcher.dispatch).toHaveBeenCalledWith(
            'observability.critical',
            expect.objectContaining({
                message: `Event listener for '${eventName}' failed.`,
            })
        );
    });

    it('should not re-initialize if already initialized', async () => {
        await stateManager.initialize(); // First initialization
        const { ServiceRegistry } = require('@platform/bootstrap/ServiceRegistry.js');
        const serviceRegistryInstance = new ServiceRegistry();
        serviceRegistryInstance.initializeAll.mockClear();

        await stateManager.initialize(); // Second call

        expect(serviceRegistryInstance.initializeAll).not.toHaveBeenCalled();
        expect(stateManager.managers.actionDispatcher.dispatch).toHaveBeenCalledWith(
            'observability.warning',
            expect.objectContaining({
                message: 'StateManager already initialized.',
            })
        );
    });

    it('should provide access to config, userContext, license, and tenant', async () => {
        // Mock managers that would be set during initialization
        stateManager.managers.license = { name: 'test-license' };
        stateManager.managers.securityManager = { getSubject: () => ({ id: 'user-123' }) };
        stateManager.managers.tenantPolicyService = { getCurrentTenant: () => 'tenant-abc' };

        await stateManager.initialize();

        expect(stateManager.config).toEqual({});
        expect(stateManager.userContext).toEqual({ id: 'user-123' });
        expect(stateManager.license).toEqual({ name: 'test-license' });
        expect(stateManager.currentTenant).toBe('tenant-abc');
    });
});
