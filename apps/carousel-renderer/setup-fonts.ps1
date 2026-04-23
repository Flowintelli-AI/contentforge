<#
.SYNOPSIS
  Downloads TTF fonts required by the carousel-renderer Azure Function.
  Run once before `npm install` and `npm run build`.
  Fonts are excluded from git (.gitignore) and must be bundled for deployment.
#>
$ErrorActionPreference = 'Stop'

$fontsDir = Join-Path $PSScriptRoot 'fonts'
if (-not (Test-Path $fontsDir)) {
  New-Item -ItemType Directory -Path $fontsDir | Out-Null
  Write-Host 'Created ./fonts/' -ForegroundColor Cyan
}

$baseUrl = 'https://raw.githubusercontent.com/google/fonts/47831f08ec6d6d7ad6b465f23dc9f9a890a2a04b/ofl/poppins'
$fonts = @(
  @{ Url = "$baseUrl/Poppins-ExtraBold.ttf"; File = 'Poppins-ExtraBold.ttf' }
  @{ Url = "$baseUrl/Poppins-SemiBold.ttf";  File = 'Poppins-SemiBold.ttf'  }
  @{ Url = "$baseUrl/Poppins-Medium.ttf";    File = 'Poppins-Medium.ttf'    }
  @{ Url = "$baseUrl/Poppins-Regular.ttf";   File = 'Poppins-Regular.ttf'   }
)

foreach ($font in $fonts) {
  $dest = Join-Path $fontsDir $font.File
  if (Test-Path $dest) {
    Write-Host "  ✓ $($font.File) (already exists)" -ForegroundColor Green
  } else {
    Write-Host "  ↓ Downloading $($font.File)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $font.Url -OutFile $dest -UseBasicParsing
    Write-Host "  ✓ $($font.File)" -ForegroundColor Green
  }
}

Write-Host "`nAll fonts ready in ./fonts/" -ForegroundColor Green
