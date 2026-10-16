"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Server,
  Plus,
  Trash2,
  Calendar,
  User,
  Building,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface DeviceRow {
  id: string;
  hostname: string;
  model: string;
  serialNumber: string;
  managementIp: string;
  role: string;
}

export default function NewSessionPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customer, setCustomer] = useState("");
  const [vendor, setVendor] = useState("fortigate");
  const [engineerName, setEngineerName] = useState("");
  const [pmDate, setPmDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");

  const [devices, setDevices] = useState<DeviceRow[]>([
    {
      id: "dev-1",
      hostname: "",
      model: "FortiGate 200F",
      serialNumber: "",
      managementIp: "",
      role: "Primary",
    },
  ]);

  const addDeviceRow = () => {
    const nextIndex = devices.length + 1;
    setDevices([
      ...devices,
      {
        id: `dev-${Date.now()}`,
        hostname: "",
        model: devices[0]?.model || "FortiGate 200F",
        serialNumber: "",
        managementIp: "",
        role: nextIndex === 2 ? "Secondary" : "Cluster-Member",
      },
    ]);
  };

  const removeDeviceRow = (id: string) => {
    if (devices.length === 1) return;
    setDevices(devices.filter((d) => d.id !== id));
  };

  const updateDevice = (id: string, field: keyof DeviceRow, value: string) => {
    setDevices(
      devices.map((d) => (d.id === id ? { ...d, [field]: value } : d))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customer.trim()) {
      setError("Please specify the customer name.");
      return;
    }

    // Filter valid devices
    const validDevices = devices
      .filter((d) => d.hostname.trim().length > 0)
      .map((d) => ({
        hostname: d.hostname.trim(),
        model: d.model.trim() || undefined,
        serialNumber: d.serialNumber.trim() || undefined,
        managementIp: d.managementIp.trim() || undefined,
        role: d.role.trim() || undefined,
      }));

    if (validDevices.length === 0) {
      setError("Please configure at least one device with a hostname.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: customer.trim(),
          vendor,
          engineerName: engineerName.trim() || undefined,
          pmDate: pmDate ? new Date(pmDate).toISOString() : undefined,
          notes: notes.trim() || undefined,
          devices: validDevices,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create PM session");
      }

      router.push(`/sessions/${data.data.id}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Sessions</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Create New PM Session
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Setup the maintenance scope, target customer, vendor adapter, and target firewalls.
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <div>
            <p className="font-semibold">Unable to create session</p>
            <p className="text-xs text-rose-300/90 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Customer & Vendor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4 text-blue-400" />
              General PM Information
            </CardTitle>
            <CardDescription>
              Identify the client organization and PM engagement details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Customer / Organization <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aurelius Hospitals, Bank Negara, Itochu"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#070b14] px-3 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Firewall Vendor Adapter <span className="text-rose-400">*</span>
                </label>
                <select
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#070b14] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm font-medium"
                >
                  <option value="fortigate" className="bg-[#0c1222]">Fortinet FortiGate (Ready &amp; Active)</option>
                  <option value="paloalto" disabled className="bg-[#0c1222]">Palo Alto Networks (Phase 10 Adapter)</option>
                  <option value="checkpoint" disabled className="bg-[#0c1222]">Check Point Quantum (Future Adapter)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Lead Engineer
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. Ziyu Cha / Ahmad Razak"
                    value={engineerName}
                    onChange={(e) => setEngineerName(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#070b14] pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Maintenance Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={pmDate}
                    onChange={(e) => setPmDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#070b14] pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 shadow-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-semibold text-slate-200">
                Session Scope / Notes (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. 2nd Half of 2026 PM. HA cluster with FortiGate 200F units. PuTTY session log to be parsed."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070b14] px-3 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Multi-Device Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="h-4 w-4 text-emerald-400" />
                  Target Firewalls ({devices.length})
                </CardTitle>
                <CardDescription>
                  Configure firewalls included in this PM session (e.g. HA active/passive pair or multiple sites).
                </CardDescription>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addDeviceRow}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Firewall</span>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {devices.map((device, idx) => (
              <div
                key={device.id}
                className="relative rounded-lg border border-slate-800 bg-[#0c1222] p-4 transition-colors hover:border-slate-700 shadow-sm"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Firewall #{idx + 1}
                  </span>

                  {devices.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDeviceRow(device.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors cursor-pointer font-medium"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300">
                      Hostname <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. FG-HQ-FW01"
                      value={device.hostname}
                      onChange={(e) =>
                        updateDevice(device.id, "hostname", e.target.value)
                      }
                      className="w-full rounded-md border border-slate-700 bg-[#070b14] px-2.5 py-1.5 text-xs text-slate-100 font-mono placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300">
                      Hardware Model
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. FortiGate 200F"
                      value={device.model}
                      onChange={(e) =>
                        updateDevice(device.id, "model", e.target.value)
                      }
                      className="w-full rounded-md border border-slate-700 bg-[#070b14] px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300">
                      Serial Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. FG200FTK21000000"
                      value={device.serialNumber}
                      onChange={(e) =>
                        updateDevice(device.id, "serialNumber", e.target.value)
                      }
                      className="w-full rounded-md border border-slate-700 bg-[#070b14] px-2.5 py-1.5 text-xs text-slate-100 font-mono placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300">
                      Cluster Role
                    </label>
                    <select
                      value={device.role}
                      onChange={(e) =>
                        updateDevice(device.id, "role", e.target.value)
                      }
                      className="w-full rounded-md border border-slate-700 bg-[#070b14] px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 shadow-xs"
                    >
                      <option value="Primary">Primary (Master)</option>
                      <option value="Secondary">Secondary (Slave)</option>
                      <option value="Standalone">Standalone</option>
                      <option value="DR">DR Site</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between pt-2">
          <Link href="/">
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>

          <Button
            type="submit"
            disabled={submitting}
            className="gap-2 bg-blue-600 hover:bg-blue-500 px-6"
          >
            {submitting ? (
              <span>Creating Session...</span>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                <span>Initialize PM Session</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
