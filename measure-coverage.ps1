param(
  [Parameter(Mandatory=$true)][string]$Git,
  [Parameter(Mandatory=$true)][string]$InputDir,
  [Parameter(Mandatory=$true)][string]$Edge,
  [Parameter(Mandatory=$true)][string]$OutputDir
)
$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
$env:RADAR_INPUT = (Resolve-Path $InputDir).Path
$env:RADAR_EDGE = (Resolve-Path $Edge).Path
$env:RADAR_BROWSER_TEST = Join-Path $repo 'test-dashboard.mjs'
$reportRoot = (New-Item -Type Directory -Force $OutputDir).FullName
$run = (New-Item -Type Directory (Join-Path $env:TEMP ('radar-coverage-' + [guid]::NewGuid()))).FullName
$test = Join-Path $repo 'test-coverage.mjs'
$versions = [ordered]@{v1='7270dff'; m7='2f97395'; m8='6e2f8de'; m9=$null}
foreach ($version in $versions.Keys) {
  $source = $repo
  if ($versions[$version]) {
    $source = (New-Item -Type Directory (Join-Path $run $version)).FullName
    $archive = Join-Path $run "$version.tar"
    & $Git -C $repo archive -o $archive $versions[$version]
    if ($LASTEXITCODE) {throw "git archive failed for $version"}
    tar.exe -xf $archive -C $source
    if ($LASTEXITCODE) {throw "Extract failed for $version"}
  }
  $env:RADAR_OUTPUT = Join-Path $run "$version-output"
  Push-Location $source
  try {
    node --experimental-test-coverage --test-coverage-include-all '--test-coverage-include=main.ts' '--test-coverage-include=lib/**/*.ts' '--test-coverage-include=dashboard/app.js' --test-reporter=spec --test-reporter-destination=stdout --test-reporter=lcov "--test-reporter-destination=$reportRoot/$version.lcov" --test $test
    if ($LASTEXITCODE) {throw "Coverage tests failed for $version"}
  } finally { Pop-Location }
}
