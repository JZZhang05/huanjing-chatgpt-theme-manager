param([switch]$Quiet)
$ErrorActionPreference='Stop'
$themeRoot=[IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$marker=Join-Path $themeRoot '.emilia-theme-install.json'
if(-not(Test-Path -LiteralPath $marker)){throw 'Install marker missing; no files removed'}
$data=Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
if($data.product -ne 'EmiliaTheme.Codex.Windows'){throw 'Not an Emilia Theme installation'}
if(-not $Quiet){
 Add-Type -AssemblyName System.Windows.Forms
 $answer=[Windows.Forms.MessageBox]::Show('卸载幻景主题管理器并保留壁纸与配色设置？','幻景主题管理器',[Windows.Forms.MessageBoxButtons]::YesNo)
 if($answer -ne [Windows.Forms.DialogResult]::Yes){exit 0}
}
$launcher=Join-Path $themeRoot 'LaunchChatGPT.exe'
$node=Join-Path $themeRoot 'runtime\node.exe'
$helpers=@(Get-CimInstance Win32_Process -Filter "Name='LaunchChatGPT.exe'" | Where-Object {$_.ExecutablePath -eq $launcher -and $_.CommandLine -like '*--watch*'})
foreach($helper in $helpers){Stop-Process -Id $helper.ProcessId -ErrorAction SilentlyContinue}
if(Test-Path -LiteralPath $node){& $node (Join-Path $themeRoot 'runtime.mjs') restore | Out-Null}
$workers=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.ExecutablePath -eq $node -and $_.CommandLine.Contains((Join-Path $themeRoot 'runtime.mjs'))})
foreach($worker in $workers){Stop-Process -Id $worker.ProcessId -ErrorAction SilentlyContinue}
$ws=New-Object -ComObject WScript.Shell
$links=@(
 (Join-Path ([Environment]::GetFolderPath('Desktop')) '幻景 · ChatGPT 主题管理器.lnk'),
 (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ChatGPT 爱蜜莉雅主题.lnk'),
 (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex 爱蜜莉雅主题.lnk'),
 (Join-Path ([Environment]::GetFolderPath('Startup')) '幻景主题管理器.lnk'),
 (Join-Path ([Environment]::GetFolderPath('Startup')) 'Emilia Theme.lnk')
)
$programFolders=@((Join-Path ([Environment]::GetFolderPath('Programs')) '幻景主题管理器'),(Join-Path ([Environment]::GetFolderPath('Programs')) 'Emilia Theme'))
foreach($programs in $programFolders){if(Test-Path -LiteralPath $programs){$links+=@(Get-ChildItem -LiteralPath $programs -File -Filter '*.lnk' | Select-Object -ExpandProperty FullName)}}
foreach($file in $links){if(Test-Path -LiteralPath $file){$link=$ws.CreateShortcut($file);if($link.TargetPath.StartsWith($themeRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or $link.Arguments.Contains($themeRoot+'\')){Remove-Item -LiteralPath $file -Force}}}
foreach($programs in $programFolders){if((Test-Path -LiteralPath $programs) -and @(Get-ChildItem -LiteralPath $programs -Force).Count -eq 0){Remove-Item -LiteralPath $programs}}
foreach($key in @('HKCU:\Software\EmiliaTheme','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\EmiliaTheme')){
 $entry=Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
 if($entry -and $entry.InstallLocation -eq $themeRoot){Remove-Item -Path $key -Recurse -Force}
}
$manifest=Get-Content -LiteralPath (Join-Path $themeRoot 'package-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($item in $manifest.files){
 $relative=[string]$item.path
 if($relative.StartsWith('media/') -or $relative -in @('background.png','使用说明.txt','package-manifest.json')){continue}
 $file=[IO.Path]::GetFullPath((Join-Path $themeRoot $relative))
 if($file.StartsWith($themeRoot+'\',[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)){Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue}
}
if(Test-Path -LiteralPath $marker){Remove-Item -LiteralPath $marker -Force}
if(-not $Quiet){[Windows.Forms.MessageBox]::Show('幻景主题管理器已卸载。壁纸、推荐配色和个人调节设置仍保留在原目录，可重新安装恢复。','幻景主题管理器') | Out-Null}
