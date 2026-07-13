param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = "root",

  [Parameter(Mandatory = $true)]
  [string]$Domain,

  [Parameter(Mandatory = $true)]
  [string]$LetsEncryptEmail,

  [string]$KeyPath = "",

  [ValidateRange(1024, 65535)]
  [int]$Port = 3001,

  [string]$RemoteDir = "/var/www/grit-learning-habits"
)

$ErrorActionPreference = "Stop"

$script = Join-Path $PSScriptRoot "scripts/deploy-aliyun-ecs.ps1"
& $script @PSBoundParameters
