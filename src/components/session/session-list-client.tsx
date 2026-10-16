"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Server,
  FileText,
  Calendar,
  User,
  ArrowRight,
  Search,
  Shield,
  Layers,
  CheckCircle2,
  Clock,
  PlusCircle,
  FileSpreadsheet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

interface DeviceSummary {
  id: string;
  hostname: string;
  model: string | null;
  serialNumber: string | null;
  role: string | null;
}

interface UploadedFileSummary {
  id: string;
  type: string;
  originalFilename: string;
  sizeBytes: number;
}

export interface SessionItem {
  id: string;
  customer: string;
  vendor: string;
  engineerName: string | null;
  pmDate: string | Date;
  status: string;
  notes: string | null;
  createdAt: string | Date;
  devices: DeviceSummary[];
  uploadedFiles: UploadedFileSummary[];
  _count: {
    devices: number;
    uploadedFiles: number;
    generatedReports: number;
  };
}

export function SessionListClient({
  initialSessions,
}: {
  initialSessions: SessionItem[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filteredSessions = initialSessions.filter((session) => {
    const matchesSearch =
      session.customer.toLowerCase().includes(search.toLowerCase()) ||
      (session.engineerName &&
        session.engineerName.toLowerCase().includes(search.toLowerCase())) ||
      session.devices.some((d) =>
        d.hostname.toLowerCase().includes(search.toLowerCase())
      );

    const matchesStatus =
      statusFilter === "ALL" || session.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Badge variant="success">Completed</Badge>;
      case "REVIEW":
        return <Badge variant="warning">Ready for Review</Badge>;
      case "IN_PROGRESS":
        return <Badge variant="default">In Progress</Badge>;
      case "DRAFT":
      default:
        return <Badge variant="secondary">Draft</Badge>;
    }
  };

  const totalDevices = initialSessions.reduce(
    (acc, s) => acc + (s.devices?.length || 0),
    0
  );
  const totalFiles = initialSessions.reduce(
    (acc, s) => acc + (s.uploadedFiles?.length || 0),
    0
  );

  return (
    <div className="space-y-8">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-800/80 bg-[#0c1222] shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-300">Total Sessions</p>
              <h4 className="mt-1 text-2xl font-bold text-white">
                {initialSessions.length}
              </h4>
            </div>
            <div className="h-10 w-10 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400 border border-blue-500/30">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800/80 bg-[#0c1222] shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-300">Managed Firewalls</p>
              <h4 className="mt-1 text-2xl font-bold text-white">
                {totalDevices}
              </h4>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 border border-emerald-500/30">
              <Server className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800/80 bg-[#0c1222] shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-300">Preserved Logs &amp; Docs</p>
              <h4 className="mt-1 text-2xl font-bold text-white">
                {totalFiles}
              </h4>
            </div>
            <div className="h-10 w-10 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-400 border border-purple-500/30">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800/80 bg-[#0c1222] shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-300">Vendor Engine</p>
              <h4 className="mt-1 text-base font-semibold text-white flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-rose-400" />
                FortiGate v1.1
              </h4>
              <p className="text-[11px] text-slate-300 font-medium">CTC QMS-P09-F01</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-rose-500/15 flex items-center justify-center text-rose-400 border border-rose-500/30">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer, engineer, or hostname..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-[#070b14] pl-9 pr-4 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {["ALL", "DRAFT", "IN_PROGRESS", "REVIEW", "COMPLETED"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === status
                  ? "bg-blue-600 text-white font-semibold shadow-md shadow-blue-900/40"
                  : "bg-[#070b14] border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-800"
              }`}
            >
              {status === "ALL" ? "All Sessions" : status.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Session Cards List */}
      {filteredSessions.length === 0 ? (
        <Card className="border-dashed border-slate-700/80 bg-[#070b14] p-12 text-center shadow-lg">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-slate-200 border border-slate-700 mb-4">
            <Clock className="h-7 w-7 text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-white">
            {initialSessions.length === 0
              ? "No PM Sessions created yet"
              : "No sessions match your search"}
          </h3>
          <p className="mt-2 text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
            {initialSessions.length === 0
              ? "Start a new Preventive Maintenance session to upload PuTTY session logs and CTC Word reports."
              : "Try adjusting your search criteria or resetting the status filters."}
          </p>
          {initialSessions.length === 0 && (
            <div className="mt-6">
              <Link href="/sessions/new">
                <Button className="gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/40">
                  <PlusCircle className="h-4 w-4" />
                  Create First PM Session
                </Button>
              </Link>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredSessions.map((session) => (
            <Card
              key={session.id}
              className="border-slate-800 bg-[#0c1222] hover:border-slate-700 hover:bg-[#0f172a] transition-all shadow-md"
            >
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-lg text-white">
                        {session.customer}
                      </span>
                      {getStatusBadge(session.status)}
                      <Badge variant="outline" className="capitalize">
                        {session.vendor}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span>PM Date: {formatDate(session.pmDate)}</span>
                      </div>
                      {session.engineerName && (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span>Engineer: {session.engineerName}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        <span>{session._count.uploadedFiles} files uploaded</span>
                      </div>
                    </div>

                    {/* Devices preview */}
                    {session.devices && session.devices.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
                          <Server className="h-3 w-3" /> Devices:
                        </span>
                        {session.devices.map((device) => (
                          <span
                            key={device.id}
                            className="inline-flex items-center rounded-md bg-[#070b14] px-2 py-0.5 text-xs text-slate-200 font-mono border border-slate-700"
                          >
                            {device.hostname}
                            {device.role && (
                              <span className="ml-1 text-[10px] text-slate-400">
                                ({device.role})
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 pt-2 lg:pt-0">
                    <Link href={`/sessions/${session.id}`}>
                      <Button variant="secondary" className="gap-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 shadow-sm">
                        <span>Open Workspace</span>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
