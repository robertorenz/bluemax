<#
.SYNOPSIS
    Builds BLUEMAX.PRG for the Commander X16, and optionally runs it.

.DESCRIPTION
    Regenerates the graphics data, then assembles and links with cc65.

    Toolchain locations are taken from $env:CC65_HOME and $env:X16_HOME, or
    from -Cc65 / -Emu. Both default to the layout used during development:
        C:\ai\tools\cc65     (cc65 snapshot, needs bin\cl65.exe)
        C:\ai\tools\x16emu   (x16-emulator, needs x16emu.exe and rom.bin)

.EXAMPLE
    .\tools\build.ps1 -Run
    .\tools\build.ps1 -Define AUTOSTART,DEMO -Run
#>
[CmdletBinding()]
param(
    [string]   $Cc65    = $(if ($env:CC65_HOME) { $env:CC65_HOME } else { 'C:\ai\tools\cc65' }),
    [string]   $Emu     = $(if ($env:X16_HOME)  { $env:X16_HOME }  else { 'C:\ai\tools\x16emu' }),
    [string[]] $Define  = @(),
    [switch]   $Run,
    [switch]   $SkipGfx
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $cl65 = Join-Path $Cc65 'bin\cl65.exe'
    if (-not (Test-Path $cl65)) {
        throw "cl65 not found at $cl65. Install cc65 or set CC65_HOME / -Cc65."
    }

    if (-not $SkipGfx) {
        Write-Host 'Generating graphics...' -ForegroundColor Cyan
        node tools/gfx.cjs
    }

    New-Item -ItemType Directory -Force -Path build | Out-Null

    $args = @(
        '-t', 'cx16'
        '-C', (Join-Path $Cc65 'cfg\cx16-asm.cfg')
        '-u', '__EXEHDR__'                  # emits the "SYS 2061" BASIC stub
        '-I', 'src'
        '--bin-include-dir', 'src'
        '-m', 'build/bluemax.map'
        '-o', 'BLUEMAX.PRG'
    )
    foreach ($d in $Define) { $args += @('--asm-define', $d) }
    $args += 'src/bluemax.asm'

    Write-Host 'Assembling...' -ForegroundColor Cyan
    & $cl65 @args
    if ($LASTEXITCODE -ne 0) { throw "cl65 failed with exit code $LASTEXITCODE" }

    $size = (Get-Item 'BLUEMAX.PRG').Length
    Write-Host "BLUEMAX.PRG  $size bytes" -ForegroundColor Green

    if ($Run) {
        $exe = Join-Path $Emu 'x16emu.exe'
        if (-not (Test-Path $exe)) {
            throw "x16emu not found at $exe. Install it or set X16_HOME / -Emu."
        }
        & $exe -rom (Join-Path $Emu 'rom.bin') -prg (Join-Path $root 'BLUEMAX.PRG') -run -scale 2
    }
}
finally {
    Pop-Location
}
