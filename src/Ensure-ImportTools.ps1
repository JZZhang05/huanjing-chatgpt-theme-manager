$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$themeRoot=$PSScriptRoot
$tools=Join-Path $themeRoot 'tools'
$ffmpeg=Join-Path $tools 'ffmpeg.exe'
if(Test-Path -LiteralPath $ffmpeg){Write-Output '{"ready":true}';exit 0}
$info=Get-Content -LiteralPath (Join-Path $tools 'ffmpeg-download.json') -Raw | ConvertFrom-Json
$url=[Uri]$info.url
if($url.Scheme -ne 'https' -or $url.Host -ne 'files.pythonhosted.org' -or $info.sha256 -notmatch '^[0-9a-f]{64}$'){throw 'Invalid encoder source'}
$archive=Join-Path $tools ('.encoder-'+[Guid]::NewGuid().ToString('N')+'.zip')
$tempExe=Join-Path $tools ('.ffmpeg-'+[Guid]::NewGuid().ToString('N')+'.exe')
try{
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 Invoke-WebRequest -Uri $url.AbsoluteUri -OutFile $archive -UseBasicParsing -TimeoutSec 180
 if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $info.sha256){throw 'Encoder checksum mismatch'}
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $zip=[IO.Compression.ZipFile]::OpenRead($archive)
 try{
  $entry=$zip.GetEntry([string]$info.entry)
  if(-not $entry -or $entry.Length -gt 200MB){throw 'Encoder archive content invalid'}
  [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$tempExe,$false)
 }finally{$zip.Dispose()}
 Move-Item -LiteralPath $tempExe -Destination $ffmpeg -Force
 Write-Output '{"ready":true}'
}finally{
 if(Test-Path -LiteralPath $archive){Remove-Item -LiteralPath $archive -Force}
 if(Test-Path -LiteralPath $tempExe){Remove-Item -LiteralPath $tempExe -Force}
}
