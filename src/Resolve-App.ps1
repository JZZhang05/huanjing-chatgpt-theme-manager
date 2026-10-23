$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$themeRoot=$PSScriptRoot
$family='OpenAI.Codex_2p2nqsd0c76g0'
$package=Get-AppxPackage -Name OpenAI.Codex | Where-Object {$_.PackageFamilyName -eq $family} | Sort-Object Version -Descending | Select-Object -First 1
if(-not $package){throw '未找到兼容的新版官方 ChatGPT。请先从官方页面安装或更新 Windows 客户端：https://learn.chatgpt.com/docs/windows/windows-app'}
if([int]$package.Status -ne 0){throw 'ChatGPT 安装状态尚未就绪，等待更新完成。'}
$manifest=Get-AppxPackageManifest -Package $package
$applications=@($manifest.Package.Applications.Application)
if([string]$manifest.Package.Properties.PublisherDisplayName -ne 'OpenAI'){throw '应用发布者不匹配，无法接入。'}
$savedId=''
$savedFile=Join-Path $themeRoot 'app-id.txt'
if(Test-Path -LiteralPath $savedFile){$savedId=(Get-Content -LiteralPath $savedFile -Raw).Trim()}
$preferred=if($savedId.StartsWith($family+'!')){$savedId.Substring($family.Length+1)}else{'App'}
$application=$applications | Where-Object {$_.Id -eq $preferred} | Select-Object -First 1
if(-not $application){$application=$applications | Where-Object {([string]$_.Executable).Replace('\','/') -match '(^|/)(ChatGPT|Codex)\.exe$'} | Select-Object -First 1}
if(-not $application){throw '没有找到 ChatGPT 的主程序入口，保留原配置并稍后重试。'}
$install=[IO.Path]::GetFullPath([string]$package.InstallLocation).TrimEnd('\','/')
$exe=[IO.Path]::GetFullPath((Join-Path $install ([string]$application.Executable)))
if(-not $exe.StartsWith($install+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($exe) -ne '.exe' -or -not(Test-Path -LiteralPath $exe -PathType Leaf)){throw '主程序文件尚未就绪，等待更新完成。'}
if([IO.Path]::GetFileName($exe) -ne 'ChatGPT.exe' -or -not(Test-Path -LiteralPath (Join-Path (Split-Path $exe -Parent) 'chrome.dll'))){throw '该客户端尚未适配，请更新为新版官方 ChatGPT Windows 客户端。'}
$result=[ordered]@{family=$family;aumid=($family+'!'+[string]$application.Id);version=$package.Version.ToString();installLocation=$install;executable=$exe;processName=[IO.Path]::GetFileNameWithoutExtension($exe);resolvedAt=[DateTimeOffset]::UtcNow.ToString('o')}
$result | ConvertTo-Json -Compress
