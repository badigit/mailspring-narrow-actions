param(
    [string]$PackagesPath = (Join-Path $env:APPDATA 'Mailspring\packages')
)

$ErrorActionPreference = 'Stop'
# A caller using PowerShell 7 may pass its module search path to Windows PowerShell.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1')
$pluginName = 'narrow-thread-actions'
$destination = Join-Path $PackagesPath $pluginName
$files = @('package.json', 'lib\entry.js', 'lib\main.js', 'styles\main.less')
$metadata = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json
if ($metadata.name -ne $pluginName) { throw 'Unexpected package name' }

foreach ($relative in $files) {
    $source = Join-Path $PSScriptRoot $relative
    if ((Get-Item -LiteralPath $source).Length -lt 50) { throw "Empty or invalid source: $relative" }
    $target = Join-Path $destination $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
    if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash) {
        throw "Installed file differs: $relative"
    }
}
$status = @{
    version = $metadata.version
    state = 'installed'
    updatedAt = [DateTime]::UtcNow.ToString('o')
}
$status | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'status.json') -Encoding UTF8
Write-Output "Installed $pluginName $($metadata.version) into $destination"
Write-Output 'Reload Mailspring to activate the package.'
