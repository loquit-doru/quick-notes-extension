# Clear cached Chrome extension data for Quick Notes (optional, if Reload is not enough)
# Usage: powershell -File scripts/clear-chrome-extension-icon-cache.ps1 -ExtensionId iicfboonjjmjfaandlijdgohnngjiaeo
# Close Chrome completely before running.

param(
  [string]$ExtensionId = 'iicfboonjjmjfaandlijdgohnngjiaeo'
)

$chromeData = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
if (-not (Test-Path $chromeData)) {
  Write-Warning "Chrome User Data not found at $chromeData"
  exit 1
}

$targets = @(
  (Join-Path $chromeData "Default\Extensions\$ExtensionId"),
  (Join-Path $chromeData "Profile 1\Extensions\$ExtensionId")
)

$removed = 0
foreach ($t in $targets) {
  if (Test-Path $t) {
    Remove-Item $t -Recurse -Force
    Write-Output "Removed: $t"
    $removed++
  }
}

if ($removed -eq 0) {
  Write-Output "No cached Extensions folder for ID $ExtensionId (unpacked-only installs often have none)."
} else {
  Write-Output "Done. Re-open Chrome and Load unpacked from your repo folder."
}
