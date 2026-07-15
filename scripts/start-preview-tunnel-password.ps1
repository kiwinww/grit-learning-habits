$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ssh2Root = Join-Path $env:TEMP "family-star-coin-ssh2"
$binary = Join-Path $env:TEMP "cloudflared-linux-amd64"
if (-not (Test-Path -LiteralPath $binary)) { throw "Missing local cloudflared binary." }

$credential = Get-Credential -UserName "root" -Message "Enter the Aliyun ECS password to finish the HTTPS preview tunnel."
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $payload = @{ password = $password } | ConvertTo-Json -Compress
  $env:SSH2_NODE_ROOT = $ssh2Root
  $payload | node (Join-Path $root "scripts\start-preview-tunnel-password.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Preview tunnel failed with exit code $LASTEXITCODE" }
}
finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  Remove-Item Env:\SSH2_NODE_ROOT -ErrorAction SilentlyContinue
  $password = $null
}
