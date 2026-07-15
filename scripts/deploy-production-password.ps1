$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ssh2Root = Join-Path $env:TEMP "family-star-coin-ssh2"

if (-not (Test-Path -LiteralPath (Join-Path $ssh2Root "node_modules\ssh2"))) {
  New-Item -ItemType Directory -Force -Path $ssh2Root | Out-Null
  if (-not (Test-Path -LiteralPath (Join-Path $ssh2Root "package.json"))) {
    npm.cmd --prefix $ssh2Root init -y | Out-Null
  }
  npm.cmd --prefix $ssh2Root install ssh2@1.16.0 --no-audit --no-fund
}

$credential = Get-Credential -UserName "root" -Message "Enter the Aliyun ECS password for the production deployment."
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $payload = @{ password = $password } | ConvertTo-Json -Compress
  $env:SSH2_NODE_ROOT = $ssh2Root
  $payload | node (Join-Path $root "scripts\deploy-production-password.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Production deployment failed with exit code $LASTEXITCODE" }
}
finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  Remove-Item Env:\SSH2_NODE_ROOT -ErrorAction SilentlyContinue
  $password = $null
}
