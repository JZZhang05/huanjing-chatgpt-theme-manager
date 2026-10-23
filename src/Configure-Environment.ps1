param([switch]$NoDefaults)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$themeRoot=$PSScriptRoot
New-Item -ItemType Directory -Path (Join-Path $themeRoot 'media') -Force | Out-Null
function ReadJson([string]$file){if(Test-Path -LiteralPath $file){Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json}}
if(-not $NoDefaults){
 foreach($name in @('catalog.json','recommended.json','background.json','appearance.json','customization.json','wallpaper-library.json')){
  $default=Join-Path $themeRoot ('defaults\'+$name);$target=Join-Path $themeRoot $name
  if(-not(Test-Path -LiteralPath $target)){Copy-Item -LiteralPath $default -Destination $target}
 }
 foreach($name in @('catalog.json','recommended.json')){
  $target=Join-Path $themeRoot $name;$current=ReadJson $target;$default=ReadJson (Join-Path $themeRoot ('defaults\'+$name));$changed=$false
  foreach($property in $default.PSObject.Properties){if(-not $current.PSObject.Properties[$property.Name]){$current | Add-Member -NotePropertyName $property.Name -NotePropertyValue $property.Value;$changed=$true}}
  if($changed){[IO.File]::WriteAllText($target,($current | ConvertTo-Json -Depth 12),(New-Object System.Text.UTF8Encoding($false)))}
 }
}
$old=ReadJson (Join-Path $themeRoot 'import-settings.json')
$libraries=New-Object 'System.Collections.Generic.List[string]'
function AddLibrary([string]$directory){
 if($directory -and (Test-Path -LiteralPath $directory -PathType Container)){
  $resolved=[IO.Path]::GetFullPath($directory).TrimEnd('\','/')
  if(-not $libraries.Contains($resolved)){$libraries.Add($resolved)}
 }
}
foreach($registry in @('HKCU:\Software\Valve\Steam','HKLM:\Software\WOW6432Node\Valve\Steam','HKLM:\Software\Valve\Steam')){
 $item=Get-ItemProperty -LiteralPath $registry -ErrorAction SilentlyContinue
 if($item){AddLibrary ([string]$item.SteamPath);AddLibrary ([string]$item.InstallPath)}
}
AddLibrary (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Steam')
if($old){foreach($workshop in $old.workshopRoots){if($workshop -and (Test-Path -LiteralPath $workshop)){$directory=$workshop;for($i=0;$i -lt 4;$i++){$directory=Split-Path $directory -Parent};AddLibrary $directory}}}
foreach($directory in @($libraries.ToArray())){
 foreach($vdf in @((Join-Path $directory 'steamapps\libraryfolders.vdf'),(Join-Path $directory 'config\libraryfolders.vdf'))){
  if(Test-Path -LiteralPath $vdf){$text=Get-Content -LiteralPath $vdf -Raw;foreach($match in [regex]::Matches($text,'"path"\s*"([^"]+)"')){AddLibrary ($match.Groups[1].Value.Replace('\\','\'))}}
 }
}
$engine=''
$workshops=New-Object 'System.Collections.Generic.List[string]'
foreach($directory in $libraries){
 $workshop=Join-Path $directory 'steamapps\workshop\content\431960'
 if(Test-Path -LiteralPath $workshop){$workshops.Add($workshop)}
 if(-not $engine){foreach($name in @('wallpaper64.exe','wallpaper32.exe')){$candidate=Join-Path $directory ('steamapps\common\wallpaper_engine\'+$name);if(Test-Path -LiteralPath $candidate -PathType Leaf){$engine=$candidate;break}}}
}
if(-not $engine -and $old -and $old.engine -and (Test-Path -LiteralPath $old.engine)){$engine=[string]$old.engine}
$python=Join-Path $themeRoot 'tools\python\python.exe'
$capturePython=Join-Path $themeRoot 'tools\python\Lib\site-packages'
if(-not(Test-Path -LiteralPath $python)){
 if($old -and $old.python -and (Test-Path -LiteralPath $old.python)){$python=[string]$old.python;$capturePython=[string]$old.capturePython}
 else{$command=Get-Command python.exe -ErrorAction SilentlyContinue;if($command){$python=$command.Source}}
}
$ffmpeg=Join-Path $themeRoot 'tools\ffmpeg.exe'
if(-not(Test-Path -LiteralPath $ffmpeg) -and (Test-Path -LiteralPath (Join-Path $themeRoot 'capture-tools\ffmpeg.exe'))){$ffmpeg=Join-Path $themeRoot 'capture-tools\ffmpeg.exe'}
$settings=[ordered]@{themeRoot=$themeRoot;python=$python;engine=$engine;ffmpeg=$ffmpeg;capturePython=$capturePython;workshopRoots=@($workshops.ToArray())}
$json=$settings | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $themeRoot 'import-settings.json'),$json,(New-Object System.Text.UTF8Encoding($false)))
Write-Output '{"configured":true}'
