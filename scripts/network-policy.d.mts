export function networkMode(): "intranet" | "external";
export function isIntranetAddress(hostname: string): boolean;
export function assertNetworkUrlAllowed(url: string | URL, mode?: "intranet" | "external"): Promise<void>;
export function installNetworkPolicy(): void;
