$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 4173
$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".svg" = "image/svg+xml; charset=utf-8"
  ".txt" = "text/plain; charset=utf-8"
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream] $Stream,
    [int] $Status,
    [string] $ContentType,
    [byte[]] $Body
  )

  $Reason = if ($Status -eq 200) { "OK" } else { "Not Found" }
  $Header = "HTTP/1.1 $Status $Reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($Header)
  $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

function Resolve-RequestPath {
  param([string] $RawPath)

  $Path = [System.Uri]::UnescapeDataString(($RawPath -split "\?")[0])
  if ($Path -eq "/") { $Path = "/index.html" }
  $Path = $Path.TrimStart("/", "\")
  $FullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $Path))

  if (-not $FullPath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }
  return $FullPath
}

$Listener.Start()
Write-Host "Flight Reader running:"
Write-Host "  This PC: http://localhost:$Port"
Write-Host "  Phone:   http://192.168.0.35:$Port"
Write-Host ""
Write-Host "Keep this window open while testing on your phone. Press Ctrl+C to stop."

while ($true) {
  $Client = $Listener.AcceptTcpClient()
  try {
    $Stream = $Client.GetStream()
    $Buffer = New-Object byte[] 4096
    $Read = $Stream.Read($Buffer, 0, $Buffer.Length)
    if ($Read -le 0) { continue }

    $Request = [System.Text.Encoding]::ASCII.GetString($Buffer, 0, $Read)
    $FirstLine = ($Request -split "`r`n")[0]
    $Parts = $FirstLine -split " "
    $FilePath = if ($Parts.Length -ge 2) { Resolve-RequestPath $Parts[1] } else { $null }

    if ($FilePath -and (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
      $Ext = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
      $Type = if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" }
      Send-Response $Stream 200 $Type ([System.IO.File]::ReadAllBytes($FilePath))
    } else {
      Send-Response $Stream 404 "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Not found"))
    }
  } finally {
    $Client.Close()
  }
}
