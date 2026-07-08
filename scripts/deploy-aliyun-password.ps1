$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ssh2Root = Join-Path $env:TEMP "grit-ssh-deploy-node"

if (-not (Test-Path (Join-Path $ssh2Root "node_modules\ssh2"))) {
  New-Item -ItemType Directory -Force -Path $ssh2Root | Out-Null
  if (-not (Test-Path (Join-Path $ssh2Root "package.json"))) {
    npm --prefix $ssh2Root init -y | Out-Null
  }
  npm --prefix $ssh2Root install ssh2@1.16.0 --no-audit --no-fund
}

$credential = Get-Credential -UserName "root" -Message "Enter the Aliyun ECS root password for this local deploy only."
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)

try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $payload = @{ password = $password } | ConvertTo-Json -Compress
  $env:SSH2_NODE_ROOT = $ssh2Root
  $payload | node (Join-Path $root "scripts\deploy-aliyun-password.mjs")
}
finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  Remove-Item Env:\SSH2_NODE_ROOT -ErrorAction SilentlyContinue
  $password = $null
}
