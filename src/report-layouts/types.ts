import { VendorId, CheckStatus } from "@/vendors/types";

export interface DocumentMetadata {
  customerName?: string;
  engineerName?: string;
  designation?: string;
  reportDate?: string;
  model?: string;
  hostname?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  qmsDocumentNumber?: string; // e.g. "QMS-P09-F01"
  qmsVersion?: string;        // e.g. "1.1"
}

export interface CheckboxOption {
  status: CheckStatus | string;
  label: string;
  isChecked: boolean;
  sdtId?: string;
  checkedVal?: string;
  uncheckedVal?: string;
}

export interface EditableChecklistRowTarget {
  itemNumber: string;        // e.g. "1.1", "1.2", "2.1"
  checkId: string;           // stable check ID e.g. "fg-hw-disk"
  taskName: string;          // e.g. "Hard disk space (If any)"
  sectionName: string;       // e.g. "Hardware Status"
  tableIndex: number;
  rowIndex: number;
  statusCellIndex: number;
  remarksCellIndex: number;
  currentStatus: string;     // e.g. "NA", "PASS", "FAIL"
  currentRemarks: string;    // current text in remarks cell
  checkboxOptions: CheckboxOption[];
}

export interface AppendixContainerTarget {
  appendixNumber: number;    // e.g. 1, 2, 3
  appendixTitle: string;     // e.g. "Appendix 1 – Memory Usage"
  mappedCommandId?: string;  // e.g. "cmd-fg-sys-perf"
  checkIds: string[];        // check IDs supported e.g. ["fg-hw-mem"]
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
  paragraphIndex?: number;
  existingImageRelId?: string;  // e.g. "rId12"
  existingImagePath?: string;   // e.g. "media/image7.png"
  drawingId?: string;
}

export interface ProtectedSection {
  name: string;              // e.g. "Author Details & Sign-Off", "Customer Satisfaction Survey"
  type: "TABLE" | "PARAGRAPH";
  tableIndex?: number;
  startParagraphIndex?: number;
  endParagraphIndex?: number;
  reason: string;
}

export interface DeviceSectionTarget {
  sectionIndex: number;
  tableIndex?: number;
  hostname?: string;
  model?: string;
  serialNumber?: string;
  isPrimary?: boolean;
}

export interface DocumentInspectionResult {
  isValidDocx: boolean;
  sha256Hash: string;
  fileSizeBytes: number;
  layoutId: string;
  layoutName: string;
  vendorId: VendorId;
  isSupportedLayout: boolean;
  metadata: DocumentMetadata;
  editableChecklistRows: EditableChecklistRowTarget[];
  appendixContainers: AppendixContainerTarget[];
  protectedSections: ProtectedSection[];
  deviceSections?: DeviceSectionTarget[];
  supportsMultiDeviceSections?: boolean;
  totalTables: number;
  totalImages: number;
  warnings: string[];
}

export interface ReportLayoutDefinition {
  readonly id: string;
  readonly name: string;
  readonly vendorId: VendorId;
  readonly qmsCode: string;
  readonly version: string;
  canHandle(documentXml: string, textSummary: string): boolean;
  mapChecklistRows(tables: string[]): EditableChecklistRowTarget[];
  mapAppendixContainers(documentXml: string, relsXml?: string): AppendixContainerTarget[];
  extractMetadata(documentXml: string, tables: string[]): DocumentMetadata;
  identifyProtectedSections(tables: string[]): ProtectedSection[];
  detectDeviceSections?(documentXml: string, tables: string[]): DeviceSectionTarget[];
}
