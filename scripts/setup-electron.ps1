$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageRoot = Join-Path $projectRoot 'node_modules/electron'
$version = (Get-Content -Raw -Encoding UTF8 (Join-Path $packageRoot 'package.json') | ConvertFrom-Json).version
$assetName = "electron-v$version-win32-x64.zip"
$cache = Join-Path $projectRoot '.cache/electron-manual'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$archive = Join-Path $cache $assetName
$checksums = Get-Content -Raw -Encoding UTF8 (Join-Path $packageRoot 'checksums.json') | ConvertFrom-Json
$expected = $checksums.$assetName
if (-not $expected) { throw 'Missing official Electron checksum' }
Write-Output "Downloading $assetName"
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/electron/electron/releases/tags/v$version"
$asset = $release.assets | Where-Object { $_.name -eq $assetName }
if (-not $asset) { throw 'Official Electron asset not found' }
node (Join-Path $PSScriptRoot 'download.mjs') $asset.browser_download_url $archive $asset.size $expected
if ($LASTEXITCODE -ne 0) { throw 'Electron download failed' }
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'Electron SHA-256 mismatch' }
Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $packageRoot 'dist') -Force
[IO.File]::WriteAllText((Join-Path $packageRoot 'path.txt'), 'electron.exe')
Write-Output "Electron $version installed and checksum verified."
