import { z } from "zod";

export const healthCheckSchema = z.object({
  type: z.enum(["tcp", "http", "command"]),
  url: z.string().optional(),
  host: z.string().default("127.0.0.1").optional(),
  port: z.number().int().positive().optional(),
  command: z.string().optional(),
  timeoutMs: z.number().int().positive().default(30_000).optional()
});

export const serviceSchema = z.object({
  name: z.string().min(1),
  type: z.string().default("docker").optional(),
  image: z.string().min(1),
  ports: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}).optional(),
  volumes: z.array(z.string()).default([]).optional(),
  dependsOn: z.array(z.string()).default([]).optional(),
  composeFile: z.string().optional(),
  healthCheck: healthCheckSchema.optional()
});

export const logConfigSchema = z.object({
  maxBytes: z.number().int().positive().default(5 * 1024 * 1024),
  maxFiles: z.number().int().positive().default(3)
});

export const projectSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  command: z.string().min(1),
  port: z.number().int().positive().optional(),
  url: z.string().url().optional(),
  env: z.record(z.string()).default({}).optional(),
  services: z.array(z.string()).default([]).optional(),
  healthCheck: healthCheckSchema.optional(),
  logFile: z.string().optional(),
  editor: z.string().optional()
});

export const kibacoConfigSchema = z.object({
  workspace: z.string().min(1).default("default"),
  projects: z.array(projectSchema).default([]),
  services: z.array(serviceSchema).default([])
});

export const proxyProjectSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  target: z.string().url(),
  command: z.string().min(1),
  cwd: z.string().default("."),
  services: z.array(z.string()).default([]).optional()
});

export const proxyConfigSchema = z.object({
  $schema: z.string().url().optional(),
  workspace: z.string().min(1).default("default"),
  proxyPort: z.number().int().positive().default(8080),
  log: logConfigSchema.default({}),
  services: z.array(serviceSchema).default([]),
  projects: z.array(proxyProjectSchema).default([])
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;
export type LogConfig = z.infer<typeof logConfigSchema>;
export type ServiceConfig = z.infer<typeof serviceSchema>;
export type ProjectConfig = z.infer<typeof projectSchema>;
export type KibacoConfig = z.infer<typeof kibacoConfigSchema>;
export type ProxyProjectConfig = z.infer<typeof proxyProjectSchema>;
export type ProxyConfig = z.infer<typeof proxyConfigSchema>;

export type RuntimeStatus = "running" | "stopped" | "stale" | "unknown";

export type KibacoState = {
  projects: Record<
    string,
    {
      pid?: number;
      status?: RuntimeStatus;
      lastStartedAt?: string;
      lastStoppedAt?: string;
      lastExitCode?: number | null;
      logFile?: string;
    }
  >;
};

export type DoctorIssue = {
  level: "ok" | "warn" | "error";
  code: string;
  message: string;
  suggestion?: string;
};

export type DoctorReport = {
  workspace: string;
  proxyPort: number;
  services: Array<{
    name: string;
    status: RuntimeStatus;
  }>;
  projects: Array<{
    name: string;
    status: RuntimeStatus;
    url: string;
    target: string;
  }>;
  issues: DoctorIssue[];
};
