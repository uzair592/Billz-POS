import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password cannot exceed 128 characters")
  .regex(/[a-z]/, "Password requires a lowercase letter")
  .regex(/[A-Z]/, "Password requires an uppercase letter")
  .regex(/[0-9]/, "Password requires a number");

export const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(2).max(320),
  password: z.string().min(1).max(128),
});

export const platformLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(2).max(320),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(200),
  newPassword: passwordSchema,
});

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters")
    .max(200),
  businessType: z.enum([
    "CAFE",
    "RESTAURANT",
    "BAKERY",
    "FAST_FOOD",
    "CLOUD_KITCHEN",
    "JUICE_BAR",
    "FOOD_TRUCK",
  ]),
  email: z.string().trim().toLowerCase().email("Enter a valid owner email"),
  phone: z
    .string()
    .trim()
    .min(5, "Phone must be at least 5 characters")
    .max(50),
  ownerName: z
    .string()
    .trim()
    .min(2, "Owner name must be at least 2 characters")
    .max(150),
  ownerUsername: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9._-]+$/,
      "Use only letters, numbers, dots, underscores, or hyphens",
    )
    .min(3, "Username must be at least 3 characters")
    .max(80),
  temporaryPassword: passwordSchema,
  planId: z.string().uuid("Select a subscription plan"),
  subscriptionEndsAt: z.string().datetime().optional(),
  moduleIds: z.array(z.string().uuid()).default([]),
});

export const branchSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]+$/)
    .max(30),
  address: z.string().trim().max(1000).optional(),
  phone: z.string().trim().max(50).optional(),
  timezone: z.string().trim().min(3).max(100).default("Asia/Karachi"),
  isPrimary: z.boolean().default(false),
});

export const employeeSchema = z.object({
  name: z.string().trim().min(2).max(150),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]+$/)
    .min(3)
    .max(80),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().max(50).optional(),
  temporaryPassword: passwordSchema,
  roleIds: z.array(z.string().uuid()).min(1),
  branchIds: z.array(z.string().uuid()).min(1),
});

export const onboardingBusinessSchema = z.object({
  name: z.string().trim().min(2).max(200),
  businessType: z.string().trim().min(2).max(50),
  logoUrl: z.string().url().max(1000).optional().nullable(),
  phone: z.string().trim().max(50).optional(),
});

export const onboardingSettingsSchema = z.object({
  countryCode: z.string().length(2).default("PK"),
  currencyCode: z.string().length(3).default("PKR"),
  timezone: z.string().min(3).max(100).default("Asia/Karachi"),
  locale: z.string().min(2).max(20).default("en"),
  dateFormat: z.string().min(4).max(30).default("DD-MM-YYYY"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#0f766e"),
  taxConfig: z.record(z.unknown()).default({}),
  serviceConfig: z.record(z.unknown()).default({}),
  orderTypes: z
    .array(z.string())
    .default(["DINE_IN", "TAKEAWAY", "DELIVERY", "QUICK_SALE"]),
  receiptConfig: z.record(z.unknown()).default({}),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type BranchInput = z.infer<typeof branchSchema>;
