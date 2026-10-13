# Existing local preview only. Run this file from a stable path outside the checkout.
# No reset, general seed, database restore, production deployment or volume removal.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ExpectedCommit,
    [string]$RepositoryPath = (Get-Location).Path,
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')]
    [string]$ProjectName = 'hodapreview',
    [switch]$IncludeDemoCatalog
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$writersStopped = $false
$checkoutChanged = $false
function Check-Step([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "Stopped at: $Step" }
}
function Read-Container([string]$Service) {
    $ids = @(docker compose -p $ProjectName -f docker-compose.dev.yml ps --all --quiet $Service)
    Check-Step "Find $Service"
    if ($ids.Count -ne 1) { throw "Expected exactly one existing $Service container." }
    $raw = docker inspect $ids[0]
    Check-Step "Inspect $Service"
    return @($raw | ConvertFrom-Json)[0]
}
function Wait-Preview {
    foreach ($route in @('/fa', '/tr', '/en', '/admin/login')) {
        $ready = $false
        for ($attempt = 0; $attempt -lt 15; $attempt++) {
            try {
                $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000$route" -TimeoutSec 30
                if ($response.StatusCode -eq 200) { $ready = $true; break }
            } catch { Start-Sleep -Seconds 2 }
        }
        if (-not $ready) { throw "Preview did not pass the HTTP check: $route" }
    }
}

Push-Location -LiteralPath $RepositoryPath
try {
    $repoRoot = git rev-parse --show-toplevel
    Check-Step 'Locate repository'
    if ([IO.Path]::GetFullPath($repoRoot.Trim()) -ne [IO.Path]::GetFullPath((Get-Location).Path)) {
        throw 'Run from the repository root.'
    }
    if (-not (Test-Path -LiteralPath '.env')) { throw 'Existing .env is missing.' }
    $dirty = git status --porcelain --untracked-files=no
    Check-Step 'Check local edits'
    if ($dirty) { throw 'Tracked files have local edits. They have been preserved; update stopped.' }
    $untracked = @(git -c core.quotePath=false ls-files --others --exclude-standard)
    Check-Step 'Check untracked build inputs'
    foreach ($file in $untracked) {
        # Keep personal reports, but do not execute unreviewed application files.
        if ($file -notmatch '^(?:[^/\\]+\.(?:md|txt|pdf)|docs[/\\].+\.(?:md|txt|pdf))$') {
            throw 'Untracked build inputs exist. Files were preserved; move them outside the checkout before delivery.'
        }
    }
    $target = git rev-parse --verify "$ExpectedCommit^{commit}"
    Check-Step 'Resolve reviewed commit'
    if ($target.Trim() -cne $ExpectedCommit) { throw 'Reviewed commit mismatch.' }
    $oldCommit = (git rev-parse HEAD).Trim()
    Check-Step 'Record previous commit'
    $incompatible = git diff --name-only $oldCommit $ExpectedCommit -- prisma/migrations docker-compose.dev.yml Dockerfile pnpm-lock.yaml
    Check-Step 'Check update compatibility'
    if ($incompatible) {
        throw 'This updater only accepts the already-migrated preview with unchanged Docker/dependency contracts. Use a separately reviewed upgrade for this version.'
    }
    $live = @{}
    foreach ($service in @('app', 'ops', 'postgres')) { $live[$service] = Read-Container $service }
    $projectContainers = @(docker ps --quiet --filter "label=com.docker.compose.project=$ProjectName")
    Check-Step 'Check other project writers'
    foreach ($containerId in $projectContainers) {
        $containerJson = docker inspect $containerId
        Check-Step 'Inspect running project service'
        $container = @($containerJson | ConvertFrom-Json)[0]
        $serviceName = $container.Config.Labels.'com.docker.compose.service'
        if ($serviceName -notin @('app', 'ops', 'postgres', 'cron', 'minio', 'mailpit')) {
            throw "An additional running service needs review before backup: $serviceName"
        }
    }
    $rawConfig = docker compose -p $ProjectName -f docker-compose.dev.yml config --format json
    Check-Step 'Read Compose configuration'
    $config = $rawConfig | ConvertFrom-Json
    foreach ($service in @('app', 'ops', 'postgres')) {
        $actual = $live[$service]
        $expected = $config.services.$service
        if ($actual.Config.Labels.'com.docker.compose.project' -cne $ProjectName) { throw 'Project mismatch.' }
        if ($service -eq 'app') {
            $workingDir = $actual.Config.Labels.'com.docker.compose.project.working_dir'
            if ([IO.Path]::GetFullPath($workingDir) -ne [IO.Path]::GetFullPath((Get-Location).Path)) {
                throw 'Running preview belongs to another checkout; stopped before making changes.'
            }
        }
        $envMap = @{}
        foreach ($item in $actual.Config.Env) { $pair = $item -split '=', 2; $envMap[$pair[0]] = $pair[1] }
        foreach ($entry in $expected.environment.PSObject.Properties) {
            if (-not $envMap.ContainsKey($entry.Name) -or $envMap[$entry.Name] -cne [string]$entry.Value) {
                throw "Environment differs for $service / $($entry.Name). Values are not displayed."
            }
        }
        foreach ($volume in $expected.volumes) {
            $mount = @($actual.Mounts | Where-Object { $_.Destination -eq $volume.target })
            if ($mount.Count -ne 1) { throw "Mount mismatch for $service / $($volume.target)" }
            if ($volume.type -eq 'volume') {
                $volumeName = $config.volumes.PSObject.Properties[$volume.source].Value.name
                if ($mount[0].Name -cne $volumeName) { throw "Data volume mismatch for $service / $($volume.target)" }
            }
        }
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $recovery = Join-Path $env:LOCALAPPDATA "HodaSite\delivery-$stamp"
    New-Item -ItemType Directory -Path $recovery -Force | Out-Null
    Copy-Item -LiteralPath '.env' -Destination (Join-Path $recovery 'runtime.env')
    $override = Join-Path $recovery 'preview.override.json'
    @{ services = @{ app = @{ command = @($live['app'].Config.Cmd); entrypoint = @($live['app'].Config.Entrypoint) } } } |
        ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $override -Encoding ASCII
    $dc = @('compose', '-p', $ProjectName, '-f', 'docker-compose.dev.yml', '-f', $override)
    docker @dc config --quiet
    Check-Step 'Validate recovered startup configuration'
    $oldCommit | Set-Content -LiteralPath (Join-Path $recovery 'previous-commit.txt') -Encoding ASCII
    foreach ($service in @('app', 'ops')) {
        docker image tag $live[$service].Image "${ProjectName}-${service}:before-$stamp"
        Check-Step "Preserve $service image"
    }
    $rollbackOverride = Join-Path $recovery 'previous-images.json'
    @{ services = @{
        app = @{ image = "${ProjectName}-app:before-$stamp" }
        ops = @{ image = "${ProjectName}-ops:before-$stamp" }
    } } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $rollbackOverride -Encoding ASCII
    $rollbackDc = $dc + @('-f', $rollbackOverride)
    $runningCron = @(docker @dc ps --status running --quiet cron)
    Check-Step 'Inspect scheduler'
    $services = @('app', 'ops')
    if ($runningCron.Count) { $services += 'cron' }
    Write-Host 'Stopping preview writers for a consistent database and media backup...'
    $writersStopped = $true
    docker @dc stop @services
    Check-Step 'Stop preview writers'
    $label = "before-delivery-$stamp"
    docker @dc run --rm --no-deps ops bash /app/scripts/backup/backup.sh --kind safety --label $label
    Check-Step 'Create safety backup'
    $backupPaths = @(docker @dc run --rm --no-deps ops find /backups -maxdepth 1 -type d -name "*_$label")
    Check-Step 'Locate safety backup'
    $backupDir = @($backupPaths | Where-Object { $_ -match '^/backups/[a-zA-Z0-9_-]+$' })
    if ($backupDir.Count -ne 1) { throw 'Cannot uniquely identify the new safety backup.' }
    docker @dc run --rm --no-deps ops bash /app/scripts/backup/verify.sh $backupDir[0]
    Check-Step 'Verify safety backup by isolated restore'
    docker cp "$($live['ops'].Id):$($backupDir[0])" $recovery
    Check-Step 'Copy verified recovery archive'
    # Even a failed checkout can have touched files before an I/O error.
    $checkoutChanged = $true
    git switch -c "preview/delivery-$stamp" $ExpectedCommit
    Check-Step 'Switch to reviewed delivery'
    docker @dc build app ops
    Check-Step 'Build preview images'
    docker @dc run --rm --no-deps app pnpm exec prisma generate
    Check-Step 'Generate matching Prisma client'
    # Existing previews may use next start instead of the default next dev.
    # Refresh the shared .next output before restoring the captured startup command.
    docker @dc run --rm --no-deps app pnpm build
    Check-Step 'Build the reviewed application'
    if ($IncludeDemoCatalog) {
        docker @dc run --rm --no-deps app pnpm exec tsx scripts/import-preview-style.ts
        Check-Step 'Read-only demo catalog plan'
        docker @dc run --rm --no-deps app pnpm exec tsx scripts/import-preview-style.ts --apply --confirm-demo-data
        Check-Step 'Import missing preview merchandise'
    }
    docker @dc up -d --no-deps --no-build @services
    Check-Step 'Start updated preview'
    Wait-Preview
    docker @dc ps app ops
    Check-Step 'Confirm running preview services'
    Write-Host "PREVIEW_DELIVERY_OK $ExpectedCommit"
    Write-Host "Recovery copy: $recovery"
    Write-Host 'Storefront: http://localhost:3000/fa | Admin: http://localhost:3000/admin'
} catch {
    $deliveryError = $_
    if ($writersStopped) {
        try {
            Write-Warning 'Delivery failed. Recovering the previous compatible application; committed demo data will be retained.'
            docker @dc stop @services
            Check-Step 'Stop incomplete delivery'
            if ($checkoutChanged) {
                git switch --detach $oldCommit
                Check-Step 'Recover previous source revision'
                # The dependency/schema guards above make this code rollback compatible.
                # Rebuild the old source so a compiled startup cannot serve the failed build.
                docker @rollbackDc run --rm --no-deps app pnpm build
                Check-Step 'Rebuild previous application'
            }
            docker @rollbackDc up -d --no-deps --no-build --pull never @services
            Check-Step 'Restart previous preview images'
            Wait-Preview
            Write-Warning 'PREVIOUS_PREVIEW_RECOVERED. No database reset or restore was performed.'
        } catch {
            Write-Warning 'Automatic service recovery could not finish. Keep the recovery folder and previous image tags; send the error text for recovery help.'
        }
    }
    Write-Warning 'Delivery was not completed. Existing data and recovery material were retained; do not run the general seed.'
    throw $deliveryError
} finally { Pop-Location }
