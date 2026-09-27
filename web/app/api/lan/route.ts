import os from "node:os"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Interface names that are tunnels, VMs or containers, not the Wi-Fi/Ethernet a phone can reach. */
const VIRTUAL = /^(lo|utun|tun|tap|bridge|vmnet|vboxnet|docker|veth|br-|virbr|awdl|llw|gif|stf|anpi|ap\d|zt|tailscale|wg)/i

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  if (p[0] === 10) return true
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true
  if (p[0] === 192 && p[1] === 168) return true
  return false
}

function portFrom(host: string | null): number {
  if (!host) return 3000
  // IPv6 literal hosts look like [::1]:3000
  const m = host.match(/:(\d+)$/)
  const n = m ? Number(m[1]) : NaN
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 3000
}

/** Physical Wi-Fi/Ethernet first (en0, en1, eth0, wlan0), then the rest. */
function rank(name: string): number {
  if (/^en0$/.test(name)) return 0
  if (/^(en|eth|wlan|wlp|enp|eno)\d*/i.test(name)) return 1
  return 2
}

/**
 * GET /api/lan: the addresses a phone on the same Wi-Fi can use to open the phone app.
 * Returns { urls: ["http://<private IPv4>:<port>/m", ...], port }.
 */
export function GET(request: Request) {
  const port = portFrom(request.headers.get("x-forwarded-host") ?? request.headers.get("host"))
  const found: { name: string; ip: string }[] = []
  const ifaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs || VIRTUAL.test(name)) continue
    for (const a of addrs) {
      const v4 = a.family === "IPv4" || (a.family as unknown) === 4
      if (!v4 || a.internal || !isPrivateV4(a.address)) continue
      found.push({ name, ip: a.address })
    }
  }
  found.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
  const urls = [...new Set(found.map((f) => `http://${f.ip}:${port}/m`))]
  return Response.json({ urls, port }, { headers: { "Cache-Control": "no-store" } })
}
