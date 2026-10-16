import { z } from "zod";

export const initialDeviceSchema = z.object({
  hostname: z.string().trim().min(1, "Hostname is required"),
  model: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  managementIp: z.string().trim().optional(),
  role: z.string().trim().optional(),
  haStatus: z.string().trim().optional(),
});

export const createSessionSchema = z.object({
  customer: z
    .string()
    .trim()
    .min(1, "Customer name is required")
    .max(120, "Customer name is too long"),
  vendor: z.string().trim().min(1, "Vendor selection is required").default("fortigate"),
  engineerName: z.string().trim().max(100).optional().nullable(),
  pmDate: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  devices: z.array(initialDeviceSchema).optional().default([]),
});

export const updateSessionSchema = z.object({
  customer: z.string().trim().min(1).max(120).optional(),
  vendor: z.string().trim().min(1).optional(),
  engineerName: z.string().trim().max(100).optional().nullable(),
  pmDate: z.coerce.date().optional(),
  status: z.enum(["DRAFT", "IN_PROGRESS", "REVIEW", "COMPLETED"]).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const createDeviceSchema = z.object({
  hostname: z.string().trim().min(1, "Hostname is required"),
  model: z.string().trim().optional().nullable(),
  serialNumber: z.string().trim().optional().nullable(),
  firmwareVersion: z.string().trim().optional().nullable(),
  managementIp: z.string().trim().optional().nullable(),
  role: z.string().trim().optional().nullable(),
  haStatus: z.string().trim().optional().nullable(),
});

export const updateDeviceSchema = createDeviceSchema.partial();

export const uploadFileMetadataSchema = z.object({
  type: z.enum(["PUTTY_LOG", "WORD_REPORT", "GUI_SCREENSHOT", "OTHER"]),
  deviceId: z.string().optional().nullable(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
