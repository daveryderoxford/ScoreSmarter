import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoragePersistenceService } from './storage-persistence.service';

function stubStorage(storage: Partial<StorageManager> | undefined): void {
  Object.defineProperty(navigator, 'storage', { value: storage, configurable: true });
}

describe('StoragePersistenceService', () => {
  afterEach(() => {
    stubStorage(undefined);
    vi.restoreAllMocks();
  });

  it('does not ask again when storage is already persisted', async () => {
    const persist = vi.fn();
    stubStorage({ persisted: vi.fn().mockResolvedValue(true), persist });
    const service = new StoragePersistenceService();

    await service.ensurePersisted();

    expect(service.persisted()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence once and records the answer', async () => {
    const persist = vi.fn().mockResolvedValue(false);
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist });
    const service = new StoragePersistenceService();

    await service.ensurePersisted();
    await service.ensurePersisted();

    expect(service.persisted()).toBe(false);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('reports not persisted when the browser has no storage manager', async () => {
    stubStorage(undefined);
    const service = new StoragePersistenceService();

    await service.ensurePersisted();

    expect(service.persisted()).toBe(false);
  });
});
