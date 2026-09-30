// Supplier document vault ("Paperwork on file", docs/api.md §6.2).
export * from "./types"
export { useVault, useLocalVault, useLocalVaultRaw, vaultPaths } from "./use-vault"
export { buildLocalVault, clearLocalVault, markLocal, timeSaved, REUSED_LABEL, VAULT_CATALOGUE, VAULT_NOTE } from "./local"
