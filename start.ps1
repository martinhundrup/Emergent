param([int]$Port = 3002)
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeBinary = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if (-not $nodeBinary) {
    $toolsDirectory = Join-Path $env:LOCALAPPDATA 'BonsaiTools'
    $nodeBinary = Get-ChildItem -Path (Join-Path $toolsDirectory 'node-v*-win-x64/node.exe') -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $nodeBinary) { throw 'Install Node.js 22.18 or newer to run the local preview.' }
& $nodeBinary (Join-Path $PSScriptRoot 'scripts/serve.mjs') --port $Port
