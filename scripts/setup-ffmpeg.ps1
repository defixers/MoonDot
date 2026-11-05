param([string]$Version = '9.0')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $projectRoot 'resources/ffmpeg/win32-x64'
$cache = Join-Path $projectRoot '.cache/ffmpeg'
New-Item -ItemType Directory -Force -Path $cache | Out-Null

# Only select a release-branch LGPL shared build, never a GPL/master build.
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest'
$assetName = "ffmpeg-n$Version-latest-win64-lgpl-shared-$Version.zip"
$asset = $release.assets | Where-Object { $_.name -eq $assetName }
if (-not $asset -or $asset.digest -notmatch '^sha256:[a-f0-9]{64}$') {
  throw "No checksum-verified LGPL build found: $assetName"
}
$archive = Join-Path $cache $assetName
Write-Output "Downloading $assetName"
node (Join-Path $PSScriptRoot 'download.mjs') $asset.browser_download_url $archive $asset.size ($asset.digest -replace '^sha256:', '')
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg download failed' }
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
if ("sha256:$actual" -ne $asset.digest) { throw 'FFmpeg SHA-256 mismatch' }

$extraction = Join-Path $cache ([guid]::NewGuid().ToString())
Expand-Archive -LiteralPath $archive -DestinationPath $extraction
$bundle = Get-ChildItem -LiteralPath $extraction -Directory | Select-Object -First 1
New-Item -ItemType Directory -Force -Path $target | Out-Null
Get-ChildItem -LiteralPath $bundle.FullName | Copy-Item -Destination $target -Recurse -Force
@{
  asset = $assetName
  url = $asset.browser_download_url
  sha256 = $actual
  buildSource = 'https://github.com/BtbN/FFmpeg-Builds'
  upstreamSource = "https://github.com/FFmpeg/FFmpeg/tree/release/$Version"
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'source.json') -Encoding UTF8
& (Join-Path $target 'bin/ffmpeg.exe') -version
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg verification failed' }
& (Join-Path $target 'bin/ffprobe.exe') -version
if ($LASTEXITCODE -ne 0) { throw 'ffprobe verification failed' }
Write-Output "Installed to $target"
