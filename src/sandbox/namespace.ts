import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import type { SandboxCapabilities } from "./types.js";
import { LINUX_REQUIRED_MESSAGE } from "../shared/index.js";

const execAsync = promisify(exec);

export async function detectCapabilities(): Promise<SandboxCapabilities> {
  if (process.platform !== "linux") {
    throw new Error(LINUX_REQUIRED_MESSAGE);
  }

  const [hasUserNamespace, hasPidNamespace, hasMountNamespace, hasNetNamespace] =
    await Promise.all([
      checkUserNamespace(),
      checkNamespaceSupport("pid"),
      checkNamespaceSupport("mnt"),
      checkNamespaceSupport("net"),
    ]);

  return {
    hasUserNamespace,
    hasPidNamespace,
    hasMountNamespace,
    hasNetNamespace,
    hasCgroupV2: checkCgroupV2(),
    hasSeccomp: checkSeccomp(),
    hasUnshare: await checkUnshare(),
    platform: "linux",
  };
}

async function checkUserNamespace(): Promise<boolean> {
  try {
    const max = fs
      .readFileSync("/proc/sys/user/max_user_namespaces", "utf-8")
      .trim();
    if (parseInt(max, 10) <= 0) return false;
  } catch {
    return false;
  }

  try {
    await execAsync("unshare --user --map-root-user -- true", {
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

async function checkNamespaceSupport(ns: string): Promise<boolean> {
  if (!fs.existsSync(`/proc/self/ns/${ns}`)) return false;

  const flagMap: Record<string, string> = { mnt: "--mount", pid: "--pid", net: "--net" };
  const flag = flagMap[ns];
  if (!flag) return false;

  try {
    await execAsync(
      `unshare --user --map-root-user ${flag} ${ns === "pid" ? "--fork" : ""} -- true`,
      { timeout: 3000 },
    );
    return true;
  } catch {
    return false;
  }
}

function checkCgroupV2(): boolean {
  try {
    const mounts = fs.readFileSync("/proc/mounts", "utf-8");
    return mounts.includes("cgroup2");
  } catch {
    return false;
  }
}

function checkSeccomp(): boolean {
  try {
    const status = fs.readFileSync("/proc/self/status", "utf-8");
    return status.includes("Seccomp:");
  } catch {
    return false;
  }
}

async function checkUnshare(): Promise<boolean> {
  try {
    await execAsync("which unshare", { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export interface NamespaceFlags {
  user: boolean;
  mount: boolean;
  pid: boolean;
  net: boolean;
  uts: boolean;
}

export function buildUnshareArgs(flags: NamespaceFlags): string[] {
  const args: string[] = [];

  if (flags.user) {
    args.push("--user", "--map-root-user");
  }
  if (flags.mount) {
    args.push("--mount");
  }
  if (flags.pid) {
    args.push("--pid", "--fork");
  }
  if (flags.net) {
    args.push("--net");
  }
  if (flags.uts) {
    args.push("--uts");
  }

  args.push("--");

  return args;
}

export function buildNamespaceFlags(
  capabilities: SandboxCapabilities,
  networkIsolation: boolean,
): NamespaceFlags {
  return {
    user: capabilities.hasUserNamespace,
    mount: capabilities.hasMountNamespace,
    pid: capabilities.hasPidNamespace,
    net: networkIsolation && capabilities.hasNetNamespace,
    uts: capabilities.hasUserNamespace,
  };
}
