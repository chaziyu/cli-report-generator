"use client";

import { useState } from "react";
import { X, ExternalLink, ShieldAlert, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReviewEvidenceSummary } from "@/core/review";

interface EvidenceModalProps {
  evidence: ReviewEvidenceSummary | null;
  taskName: string;
  onClose: () => void;
}

export function EvidenceModal({ evidence, taskName, onClose }: EvidenceModalProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (!evidence) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="relative flex flex-col max-h-[90vh] w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-white">
                Authentic CLI Evidence
              </span>
              {evidence.appendixMapping && (
                <Badge variant="outline" className="text-[10px] text-blue-300 border-blue-500/30 bg-blue-500/10 font-mono">
                  {evidence.appendixMapping}
                </Badge>
              )}
              {evidence.isRedacted && (
                <Badge variant="warning" className="text-[10px] flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Redacted
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Target Task: <span className="font-medium text-slate-200">{taskName}</span>
              {evidence.totalPages > 1 && (
                <span className="ml-2 font-mono text-[11px] text-slate-500">
                  (Page {evidence.pageNumber} of {evidence.totalPages})
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={evidence.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open Raw PNG</span>
            </a>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Image Display Area */}
        <div className="relative flex-1 overflow-auto bg-slate-950 p-6 flex items-center justify-center min-h-[350px]">
          {!imageLoaded && !imageError && (
            <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span className="text-xs">Loading terminal evidence...</span>
            </div>
          )}

          {imageError && (
            <div className="flex flex-col items-center justify-center gap-2 text-rose-400 p-8 text-center">
              <FileText className="h-10 w-10 text-rose-500" />
              <p className="text-sm font-semibold">Evidence Image Unavailable</p>
              <p className="text-xs text-slate-400 max-w-sm">
                The image could not be loaded from storage. Check if evidence generation completed for this device.
              </p>
            </div>
          )}

          <img
            src={evidence.imageUrl}
            alt={evidence.caption || "CLI Terminal Evidence"}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            className={`max-w-full rounded-lg border border-slate-800 shadow-xl transition-opacity duration-300 ${
              imageLoaded ? "opacity-100" : "opacity-0 absolute"
            }`}
          />
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/80 px-6 py-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Source-traceable PuTTY log output rendered with Sharp &amp; SVG font typography.</span>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
