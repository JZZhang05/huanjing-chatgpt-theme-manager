param([switch]$NoLaunch,[switch]$NoStartup,[switch]$NoDesktop,[switch]$ExtractOnly)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$themeRoot=$PSScriptRoot
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
if(-not $ExtractOnly){& (Join-Path $themeRoot 'Resolve-App.ps1') | Out-Null}
& (Join-Path $themeRoot 'Configure-Environment.ps1') | Out-Null
if($ExtractOnly){Write-Output 'Standalone files configured';exit 0}
$stop=Join-Path $themeRoot 'stop.flag';if(Test-Path -LiteralPath $stop){Remove-Item -LiteralPath $stop}
$ws=New-Object -ComObject WScript.Shell
$watcher=Join-Path $themeRoot 'LaunchChatGPT.exe'
$icon=(Join-Path $themeRoot 'theme.ico')+',0'
$programs=Join-Path ([Environment]::GetFolderPath('Programs')) '幻景主题管理器'
New-Item -ItemType Directory -Path $programs -Force | Out-Null
function Shortcut([string]$file,[string]$target,[string]$arguments){
 $link=$ws.CreateShortcut($file);$link.TargetPath=$target;$link.Arguments=$arguments;$link.WorkingDirectory=$themeRoot;$link.IconLocation=$icon;$link.Description='幻景 · ChatGPT 主题管理器';$link.Save()
}
Shortcut (Join-Path $programs '启动主题.lnk') $watcher ''
Shortcut (Join-Path $programs '修复连接.lnk') $watcher '--repair'
Shortcut (Join-Path $programs '使用说明.lnk') (Join-Path $themeRoot '使用说明.txt') ''
if(-not $NoDesktop){Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) '幻景 · ChatGPT 主题管理器.lnk') $watcher ''}
$startup=Join-Path ([Environment]::GetFolderPath('Startup')) '幻景主题管理器.lnk'
if(-not $NoStartup){Shortcut $startup (Join-Path $env:WINDIR 'System32\wscript.exe') ('"'+(Join-Path $themeRoot 'Autostart.vbs')+'"')}
elseif(Test-Path -LiteralPath $startup){$old=$ws.CreateShortcut($startup);if($old.Arguments -eq ('"'+(Join-Path $themeRoot 'Autostart.vbs')+'"')){Remove-Item -LiteralPath $startup}}
# Migrate only shortcuts owned by this installation.
$legacyPrograms=Join-Path ([Environment]::GetFolderPath('Programs')) 'Emilia Theme'
$legacyLinks=@(
 (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ChatGPT 爱蜜莉雅主题.lnk'),
 (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex 爱蜜莉雅主题.lnk'),
 (Join-Path ([Environment]::GetFolderPath('Startup')) 'Emilia Theme.lnk')
)
if(Test-Path -LiteralPath $legacyPrograms){$legacyLinks+=@(Get-ChildItem -LiteralPath $legacyPrograms -File -Filter '*.lnk' | Select-Object -ExpandProperty FullName)}
foreach($file in $legacyLinks){
 if(Test-Path -LiteralPath $file -PathType Leaf){
  $old=$ws.CreateShortcut($file)
  if($old.TargetPath.StartsWith($themeRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or $old.Arguments.Contains($themeRoot+'\')){Remove-Item -LiteralPath $file}
 }
}
if((Test-Path -LiteralPath $legacyPrograms) -and @(Get-ChildItem -LiteralPath $legacyPrograms -Force).Count -eq 0){Remove-Item -LiteralPath $legacyPrograms}
$registry='HKCU:\Software\EmiliaTheme'
New-Item -Path $registry -Force | Out-Null
New-ItemProperty -Path $registry -Name InstallLocation -Value $themeRoot -PropertyType String -Force | Out-Null
$uninstall='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\EmiliaTheme'
New-Item -Path $uninstall -Force | Out-Null
foreach($item in @{DisplayName='幻景 · ChatGPT 主题管理器';DisplayVersion='1.1.0';Publisher='幻景主题管理器（非官方）';InstallLocation=$themeRoot;DisplayIcon=$icon;UninstallString=('"'+(Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe')+'" -NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $themeRoot 'Uninstall.ps1')+'"')}.GetEnumerator()){New-ItemProperty -Path $uninstall -Name $item.Key -Value $item.Value -PropertyType String -Force | Out-Null}
foreach($name in @('NoModify','NoRepair')){New-ItemProperty -Path $uninstall -Name $name -Value 1 -PropertyType DWord -Force | Out-Null}
$marker=@{product='EmiliaTheme.Codex.Windows';displayName='幻景 · ChatGPT 主题管理器';version='1.1.0';installedAt=[DateTimeOffset]::UtcNow.ToString('o')}
[IO.File]::WriteAllText((Join-Path $themeRoot '.emilia-theme-install.json'),($marker | ConvertTo-Json),(New-Object System.Text.UTF8Encoding($false)))
if(-not $NoLaunch){
 $automation=New-Object -ComObject Shell.Application
 $desktopHandle=0
 $desktop=$automation.Windows().FindWindowSW(0,0,8,[ref]$desktopHandle,1)
 if($desktop){$desktop.Document.Application.ShellExecute($watcher,'',$themeRoot,'open',0)}
 else{Start-Process -FilePath $watcher -WorkingDirectory $themeRoot -WindowStyle Hidden | Out-Null}
}
Write-Output 'Installed for current user'
