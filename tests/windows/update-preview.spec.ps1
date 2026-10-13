# Exercise the actual PowerShell control flow with isolated filesystem fixtures
# and simulated Git/Docker/HTTP boundaries. Real restore proof runs in docker-runtime.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$updater = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../scripts/update-preview.ps1'))
$previousLocalAppData = $env:LOCALAPPDATA
$fixture = Join-Path ([IO.Path]::GetTempPath()) "hoda-updater-test-$([guid]::NewGuid().ToString('N'))"
$oldSha = '1111111111111111111111111111111111111111'
$newSha = '2222222222222222222222222222222222222222'
function Assert-Preview([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "Preview updater proof failed: $Message" }
}
function global:git {
    $a = @($args | ForEach-Object { [string]$_ })
    $command = $a -join ' '
    $global:LASTEXITCODE = 0
    $s = $global:HodaPreviewTest
    $s.Calls.Add("git $command")
    if ($command -eq 'rev-parse --show-toplevel') { return $s.Repo }
    if ($command -like 'status --porcelain*') {
        if ($s.Case -eq 'tracked') { return ' M src/app/page.tsx' }
        return
    }
    if ($command -like '*ls-files --others --exclude-standard') {
        if ($s.Case -eq 'untracked') { return 'src/app/unreviewed/page.tsx' }
        if ($s.Case -eq 'report') { return @('LOCAL_REPORT.md', 'docs/personal-notes.txt') }
        return
    }
    if ($command -like 'rev-parse --verify *') { return $s.New }
    if ($command -eq 'rev-parse HEAD') { return $s.Head }
    if ($command -like 'diff --name-only *') { return }
    if ($command -like 'switch -c *') {
        $s.Head = $s.New
        if ($s.Case -eq 'checkout') { $global:LASTEXITCODE = 1 }
        return
    }
    if ($command -like 'switch --detach *') { $s.Head = $s.Old; return }
    throw "Unexpected simulated Git command: $command"
}
function global:docker {
    $a = @($args | ForEach-Object { [string]$_ })
    $command = $a -join ' '
    $s = $global:HodaPreviewTest
    $s.Calls.Add("docker $command")
    $global:LASTEXITCODE = 0
    if ($a[0] -eq 'inspect') {
        $service = $a[1] -replace '-id$', ''
        $state = @{ Running = $s.Running; Restarting = $false; Status = $(if ($s.Running) { 'running' } else { 'exited' }) }
        $restartCount = 0
        if ($s.Head -eq $s.New) {
            if (($s.Case -eq 'ops-exited' -and $service -eq 'ops') -or ($s.Case -eq 'cron-exited' -and $service -eq 'cron')) {
                $state.Running = $false; $state.Status = 'exited'
            }
            if ($service -eq 'ops') {
                if ($s.Case -eq 'ops-restarting') { $state.Restarting = $true }
                if ($s.Case -eq 'ops-unhealthy') { $state.Health = @{ Status = 'unhealthy' } }
                if ($s.Case -eq 'ops-churn') { $s.OpsReads++; $restartCount = $s.OpsReads }
            }
        }
        if ($s.Case -eq 'recovery-health' -and $s.Head -eq $s.Old -and $s.Recovered -and $service -eq 'ops') {
            $state.Health = @{ Status = 'unhealthy' }
        }
        return (@{
            Id = "$service-id"; Image = "original-$service-image"; Mounts = @()
            State = $state; RestartCount = $restartCount
            Config = @{
                Cmd = @('pnpm', 'dev'); Entrypoint = @('docker-entrypoint.sh')
                Env = @('DATABASE_URL=postgresql://fixture:fixture@postgres:5432/hoda')
                Labels = @{
                    'com.docker.compose.project' = 'hodapreview'
                    'com.docker.compose.service' = $service
                    'com.docker.compose.project.working_dir' = $s.Repo
                }
            }
        } | ConvertTo-Json -Depth 8 -Compress)
    }
    if ($a[0] -eq 'ps') { return @('app-id', 'ops-id', 'postgres-id', 'cron-id') }
    if ($a[0] -eq 'image' -or $a[0] -eq 'cp') { return }
    if ($a[0] -ne 'compose') { throw "Unexpected simulated Docker command: $command" }
    if ($a -contains 'config') {
        if ($a -notcontains '--format') { return }
        $services = @{}
        foreach ($name in @('app', 'ops', 'postgres')) {
            $services[$name] = @{ environment = @{ DATABASE_URL = 'postgresql://fixture:fixture@postgres:5432/hoda' }; volumes = @() }
        }
        return (@{ services = $services; volumes = @{} } | ConvertTo-Json -Depth 8 -Compress)
    }
    if ($a -contains 'ps') {
        if ($a -contains '--quiet') { return "$($a[-1])-id" }
        return
    }
    if ($a -contains 'stop') { $s.Stops++; $s.Running = $false; return }
    if ($a -contains 'build' -and $a -notcontains 'run') {
        if ($s.Case -in @('imagebuild', 'rollback', 'recovery-health')) { $global:LASTEXITCODE = 1 }
        return
    }
    if ($a -contains 'up') {
        if (($s.Head -eq $s.New -and $s.Case -eq 'startup') -or ($s.Head -eq $s.Old -and $s.Case -eq 'rollback')) {
            $global:LASTEXITCODE = 1; return
        }
        if ($s.Head -eq $s.Old) {
            $override = @($a | Where-Object { $_ -like '*previous-images.json' })
            if ($override.Count -ne 1) { throw 'Recovery did not pin the previous images.' }
            $images = Get-Content -Raw -LiteralPath $override[0] | ConvertFrom-Json
            if ($images.services.app.image -notlike 'hodapreview-app:before-*' -or $images.services.ops.image -notlike 'hodapreview-ops:before-*') { throw 'Wrong recovery image tags.' }
            $s.Recovered = $true
        }
        if ($a -notcontains 'cron') { throw 'The previously running scheduler was not restarted.' }
        $s.Running = $true; return
    }
    if ($a -contains 'run') {
        if ($command -like '*scripts/backup/backup.sh*') {
            $s.Label = $a[-1]
            if ($s.Case -eq 'backup') { $global:LASTEXITCODE = 1 }
            return
        }
        if ($command -like '*scripts/backup/verify.sh*') {
            if ($s.Case -eq 'verify') { $global:LASTEXITCODE = 1 }
            return
        }
        if ($a -contains 'find') { return "/backups/test_$($s.Label)" }
        if ($command -like '*prisma generate') { return }
        if ($command -like '*pnpm build') {
            if ($s.Head -eq $s.New -and $s.Case -eq 'appbuild') { $global:LASTEXITCODE = 1 }
            return
        }
        if ($command -like '*scripts/import-preview-style.ts*') {
            if ($a -contains '--apply') {
                $s.DemoApplied++
                if ($s.Case -eq 'import') { $global:LASTEXITCODE = 1 }
            }
            return
        }
    }
    throw "Unexpected simulated Docker command: $command"
}
function global:Invoke-WebRequest {
    $s = $global:HodaPreviewTest
    if (-not $s.Running -or ($s.Case -eq 'http' -and $s.Head -eq $s.New)) { throw 'Simulated HTTP failure' }
    return [pscustomobject]@{ StatusCode = 200 }
}
function global:Start-Sleep { }

try {
    foreach ($case in @('clean', 'report', 'tracked', 'untracked', 'backup', 'verify', 'checkout', 'imagebuild', 'appbuild', 'import', 'startup', 'http', 'ops-exited', 'cron-exited', 'ops-restarting', 'ops-unhealthy', 'ops-churn', 'rollback', 'recovery-health')) {
        $repo = Join-Path $fixture $case
        New-Item -ItemType Directory -Path $repo -Force | Out-Null
        'FIXTURE_ONLY=true' | Set-Content -LiteralPath (Join-Path $repo '.env')
        $env:LOCALAPPDATA = Join-Path $repo 'profile'
        $global:HodaPreviewTest = @{
            Case = $case; Repo = $repo; Head = $oldSha; Old = $oldSha; New = $newSha
            Calls = [Collections.Generic.List[string]]::new(); Stops = 0; Running = $true
            Recovered = $false; DemoApplied = 0; Label = ''; OpsReads = 0
        }
        $failed = $false
        $log = Join-Path $repo 'result.log'
        try { & $updater -ExpectedCommit $newSha -RepositoryPath $repo -IncludeDemoCatalog *> $log }
        catch { $failed = $true }
        $s = $global:HodaPreviewTest
        $output = Get-Content -Raw -LiteralPath $log
        if ($case -in @('clean', 'report')) {
            Assert-Preview (-not $failed) "$case should succeed: $output"
            Assert-Preview ($s.Head -eq $newSha -and $s.Running -and $s.DemoApplied -eq 1) "$case delivery state"
        } elseif ($case -in @('tracked', 'untracked')) {
            Assert-Preview ($failed -and $s.Stops -eq 0 -and $s.Head -eq $oldSha) "$case must stop before touching services"
        } elseif ($case -in @('rollback', 'recovery-health')) {
            Assert-Preview ($failed -and $output -match 'Automatic service recovery could not finish' -and $output -notmatch 'PREVIOUS_PREVIEW_RECOVERED') 'report failed recovery honestly'
        } else {
            Assert-Preview ($failed -and $s.Recovered -and $s.Running -and $s.Head -eq $oldSha) "$case must recover old code/images: $output"
            Assert-Preview ($output -match 'PREVIOUS_PREVIEW_RECOVERED') "$case recovery needs health proof"
            if ($case -in @('import', 'startup', 'http')) { Assert-Preview ($s.DemoApplied -eq 1) "$case must retain committed demo data without retry" }
        }
        Assert-Preview (-not ($s.Calls | Where-Object { $_ -match 'restore\.sh|migrate reset|db seed|down -v|git reset|git clean' })) "$case must not reset/restore data or erase files"
        Write-Host "PASS preview updater: $case"
    }
} finally {
    $env:LOCALAPPDATA = $previousLocalAppData
    foreach ($name in @('git', 'docker', 'Invoke-WebRequest', 'Start-Sleep')) { Remove-Item "Function:\$name" -ErrorAction SilentlyContinue }
    Remove-Variable HodaPreviewTest -Scope Global -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
# All assertions completed. The last negative scenario deliberately left the
# simulated native exit status at 1; do not report that expected failure as CI failure.
$global:LASTEXITCODE = 0
