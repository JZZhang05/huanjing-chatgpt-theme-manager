[CmdletBinding()]
param([ValidateSet('Enable','Restore','Check')][string]$Action='Enable',[switch]$AllowRestart,[switch]$Quiet)
$ErrorActionPreference='Stop'
$themeRoot=$PSScriptRoot
$node=Join-Path $themeRoot 'runtime\node.exe'
$launcher=Join-Path $themeRoot 'LaunchChatGPT.exe'
try{
 if($Action -eq 'Check'){
  & $node -e 'const c=require("node:child_process");process.stdout.write(c.execFileSync(process.argv[1],["--diagnose-json"],{encoding:"utf8",windowsHide:true,timeout:20000}))' $launcher
  exit $LASTEXITCODE
 }
 if($Action -eq 'Restore'){
  & $node (Join-Path $themeRoot 'runtime.mjs') restore
  exit $LASTEXITCODE
 }
 $info=@{FilePath=$launcher;WorkingDirectory=$themeRoot;WindowStyle='Hidden';PassThru=$true}
 if($AllowRestart){$info.ArgumentList='--repair'}
 $process=Start-Process @info
 $process.WaitForExit(15000) | Out-Null
}catch{
 if(-not $Quiet){Add-Type -AssemblyName System.Windows.Forms;[void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'Theme startup')}
 Write-Error $_
 exit 1
}
