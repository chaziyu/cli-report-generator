import { IVendorAdapter, VendorId } from "./types";

class VendorRegistry {
  private adapters = new Map<VendorId, IVendorAdapter>();

  register(adapter: IVendorAdapter): void {
    if (this.adapters.has(adapter.id)) {
      console.warn(`Vendor adapter for "${adapter.id}" already registered. Overwriting.`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: VendorId): IVendorAdapter | undefined {
    return this.adapters.get(id);
  }

  getAll(): IVendorAdapter[] {
    return Array.from(this.adapters.values());
  }

  has(id: VendorId): boolean {
    return this.adapters.has(id);
  }

  getParser(id: VendorId): import("@/core/checks/types").IVendorParser | undefined {
    const adapter = this.get(id);
    return adapter?.getParser?.();
  }

  getSupportedVendors(): { id: VendorId; displayName: string; description: string }[] {
    return this.getAll().map((a) => ({
      id: a.id,
      displayName: a.displayName,
      description: a.description,
    }));
  }
}

export const vendorRegistry = new VendorRegistry();
