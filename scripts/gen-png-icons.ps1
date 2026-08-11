# Generate extension icons from the canonical source artwork.
# Source: screenshots/quick_notes_icon_128x128.png

Add-Type -AssemblyName System.Drawing

$repoRoot = Join-Path $PSScriptRoot '..' | Resolve-Path
$sourcePath = Join-Path $repoRoot 'screenshots\quick_notes_icon_128x128.png'
$iconsDir = Join-Path $repoRoot 'icons'

if (-not (Test-Path $sourcePath)) {
  Write-Error "Missing source icon: $sourcePath"
  exit 1
}

$source = [System.Drawing.Image]::FromFile($sourcePath)
try {
  foreach ($size in @(16, 32, 48, 128)) {
    $outQn = Join-Path $iconsDir "qn-$size.png"
    $outLegacy = Join-Path $iconsDir "icon$size.png"

    if ($size -eq 128) {
      # Use source file directly for max quality at store size
      Copy-Item $sourcePath $outQn -Force
      Copy-Item $sourcePath $outLegacy -Force
      Write-Output "Copied source -> qn-128.png, icon128.png"
      continue
    }

    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [ System.Drawing.Graphics ]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($source, 0, 0, $size, $size)
    $bmp.Save($outQn, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Save($outLegacy, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Created qn-$size.png, icon$size.png"
  }
}
finally {
  $source.Dispose()
}

Write-Output "`nSource: $sourcePath"
Write-Output "Manifest uses icons/qn-{16,32,48,128}.png"
