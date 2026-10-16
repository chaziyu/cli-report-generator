"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Download,
  Maximize2,
  ShieldCheck,
  AlertTriangle,
  FileImage,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface EvidenceItem {
  id: string;
  title: string;
  appendixMapping?: string | null;
  caption?: string | null;
  isRedacted: boolean;
  pageNumber: number;
  totalPages: number;
  sourceLabel: string;
  commandExecutionId?: string | null;
  command?: string | null;
  deviceId?: string | null;
  deviceHostname: string;
  imageUrl: string;
  storagePath: string;
  createdAt: string | Date;
}

interface EvidenceCardProps {
  evidence: EvidenceItem;
  onPreview: (evidence: EvidenceItem) => void;
}

export function EvidenceCard({ evidence, onPreview }: EvidenceCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.origin + evidence.imageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = evidence.imageUrl;
    link.download = `${evidence.appendixMapping || "evidence"}-page-${evidence.pageNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900/90 hover:border-slate-700 transition-all overflow-hidden flex flex-col group">
      {/* Card Header */}
      <div className="p-3.5 border-b border-slate-800/80 bg-slate-950/60 flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {evidence.appendixMapping && (
              <span className="inline-flex items-center rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[11px] font-mono font-semibold text-blue-300">
                {evidence.appendixMapping}
              </span>
            )}
            {evidence.totalPages > 1 && (
              <span className="inline-flex items-center rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                Page {evidence.pageNumber}/{evidence.totalPages}
              </span>
            )}
            {evidence.isRedacted && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                Sanitized
              </span>
            )}
          </div>
          <h4 className="text-xs font-semibold text-slate-200 line-clamp-1">
            {evidence.title}
          </h4>
          <span className="text-[11px] font-mono text-slate-400 block">
            Host: <span className="text-slate-200 font-semibold">{evidence.deviceHostname}</span>
            {evidence.command && (
              <span className="text-emerald-400 ml-2">&gt; {evidence.command}</span>
            )}
          </span>
        </div>

        <button
          onClick={() => onPreview(evidence)}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-colors"
          title="Full Preview"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Image Preview Container */}
      <div
        onClick={() => onPreview(evidence)}
        className="relative bg-slate-950 p-2 cursor-pointer flex-1 flex items-center justify-center min-h-[180px] overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={evidence.imageUrl}
          alt={evidence.caption || evidence.title}
          className="rounded-lg border border-slate-800/80 shadow-md group-hover:border-blue-500/40 transition-all object-contain max-h-[220px] w-full"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="rounded-lg bg-slate-900/90 border border-slate-700 px-3 py-1.5 text-xs font-medium text-white shadow-lg flex items-center gap-1.5 backdrop-blur-sm">
            <Maximize2 className="h-3.5 w-3.5 text-blue-400" />
            Click to Enlarge
          </span>
        </div>
      </div>

      {/* Card Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between text-xs">
        <span className="text-[10px] text-slate-500 flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-emerald-400" />
          PuTTY Hash Verified
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyLink}
            className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors"
            title="Copy image URL"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 transition-colors"
            title="Download PNG for Word"
          >
            <Download className="h-3 w-3" />
            <span>PNG</span>
          </button>
        </div>
      </div>
    </div>
  );
}
